"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hc = void 0;
const uuid_1 = require("uuid");
const convertHeaders = (from) => {
    const to = {};
    //@ts-ignore
    for (const [key, value] of from.entries()) {
        to[key.toLowerCase()] = value;
    }
    return to;
};
class Span {
    constructor(init) {
        this.data = {};
        this.childSpans = [];
        this.eventMeta = {
            timestamp: Date.now(),
            name: init.name,
            trace: {
                trace_id: init.traceId,
                span_id: uuid_1.v4(),
            },
            service_name: init.serviceName,
        };
        if (init.parentSpanId) {
            this.eventMeta.trace.parent_id = init.parentSpanId;
        }
    }
    toHoneycombEvents() {
        const event = Object.assign({}, this.eventMeta, { app: this.data });
        const childEvents = this.childSpans.map((span) => span.toHoneycombEvents()).flat(1);
        return [event, ...childEvents];
    }
    addData(data) {
        Object.assign(this.data, data);
    }
    addRequest(request) {
        if (!request)
            return;
        const json = {
            headers: request.headers ? convertHeaders(request.headers) : undefined,
            method: request.method,
            redirect: request.redirect,
            referrer: request.referrer,
            referrerPolicy: request.referrerPolicy,
            url: request.url,
        };
        this.addData({ request: json });
    }
    addResponse(response) {
        if (!response)
            return;
        const json = {
            headers: response.headers ? convertHeaders(response.headers) : undefined,
            ok: response.ok,
            redirected: response.redirected,
            status: response.status,
            statusText: response.statusText,
            url: response.url,
        };
        this.addData({ response: json });
    }
    log(message) {
        this.data.logs = this.data.logs || [];
        this.data.logs.push(message);
    }
    start() {
        this.eventMeta.timestamp = Date.now();
    }
    finish() {
        this.eventMeta.duration_ms = Date.now() - this.eventMeta.timestamp;
    }
    fetch(input, init) {
        const request = new Request(input, init);
        const childSpan = this.startChildSpan(request.url, 'fetch');
        childSpan.addRequest(request);
        const promise = fetch(input, init);
        promise
            .then((response) => {
                childSpan.addResponse(response);
                childSpan.finish();
                return response;
            })
            .catch((reason) => {
                childSpan.addData({ exception: reason });
                childSpan.finish();
                throw reason;
            });
        return promise;
    }
    startChildSpan(name, serviceName) {
        const trace = this.eventMeta.trace;
        const span = new Span({ name, traceId: trace.trace_id, parentSpanId: trace.span_id, serviceName });
        this.childSpans.push(span);
        return span;
    }
}
class RequestTracer extends Span {
    constructor(request) {
        super({
            name: 'request',
            traceId: uuid_1.v4(),
            serviceName: 'worker',
        });
        this.request = request;
        this.addRequest(request);
    }
    async sendEvents(config, excludeSpans) {
        const events = this.toHoneycombEvents();
        const url = `https://api.honeycomb.io/1/batch/${encodeURIComponent(config.dataset)}`;
        const body = events
            .filter((event) => (excludeSpans ? !excludeSpans.includes(event.name) : true))
            .map((event) => {
                return {
                    time: new Date(event.timestamp).toISOString(),
                    data: event,
                };
            });
        const params = {
            method: 'POST',
            body: JSON.stringify(body),
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-Honeycomb-Team': config.apiKey,
            },
        };
        const response = await fetch(url, params);
        console.log('Honeycomb Response Status: ' + response.status);
        const text = await response.text();
        console.log('Response: ' + text);
    }
}
class LogWrapper {
    constructor(event, listener, config) {
        this.event = event;
        this.config = config;
        this.responseFinished = false;
        this.openUserWait = false;
        this.waitUntilUsed = false;
        this.tracer = new RequestTracer(event.request);
        this.setupWaitUntil(event);
        this.setUpRespondWith(event, listener);
    }
    async sendEvents() {
        if (this.responseFinished && !this.openUserWait) {
            const excludes = this.waitUntilUsed ? [] : ['waitUntil'];
            await this.tracer.sendEvents(this.config, excludes);
            this.waitUntilResolve();
        }
    }
    finishResponse(response, error) {
        if (response) {
            this.tracer.addResponse(response);
            this.responseResolve(response);
        }
        else {
            this.tracer.addData({ exception: error.toString() });
            if (error.stack)
                this.tracer.addData({ stacktrace: error.stack });
            this.responseReject(error);
        }
        this.responseFinished = true;
        this.tracer.finish();
        this.sendEvents();
    }
    startWaitUntil() {
        this.openUserWait = true;
        this.waitUntilUsed = true;
        this.waitUntilSpan.start();
    }
    finishWaitUntil(error) {
        this.openUserWait = false;
        if (error) {
            this.waitUntilSpan.addData({ exception: error });
        }
        this.waitUntilSpan.finish();
        this.sendEvents();
    }
    setupWaitUntil(event) {
        this.waitUntilSpan = this.tracer.startChildSpan('waitUntil', 'worker');
        const waitUntilPromise = new Promise((resolve) => {
            this.waitUntilResolve = resolve;
        });
        event.waitUntil(waitUntilPromise);
        this.proxyWaitUntil();
    }
    proxyWaitUntil() {
        const logger = this;
        this.event.waitUntil = new Proxy(this.event.waitUntil, {
            apply: function (_target, _thisArg, argArray) {
                logger.startWaitUntil();
                const promise = Promise.resolve(argArray[0]);
                promise
                    .then(() => {
                        logger.finishWaitUntil();
                    })
                    .catch((reason) => {
                        logger.finishWaitUntil(reason);
                    });
            },
        });
    }
    setUpRespondWith(event, listener) {
        const responsePromise = new Promise((resolve, reject) => {
            this.responseResolve = resolve;
            this.responseReject = reject;
        });
        event.respondWith(responsePromise);
        this.proxyRespondWith();
        try {
            const trace_event = event;
            trace_event.request.tracer = this.tracer;
            trace_event.waitUntilTracer = this.waitUntilSpan;
            listener(trace_event, this.tracer);
        }
        catch (err) {
            this.finishResponse(null, err);
        }
    }
    proxyRespondWith() {
        const logger = this;
        this.event.respondWith = new Proxy(this.event.respondWith, {
            apply: function (_target, _thisArg, argArray) {
                const promise = Promise.resolve(argArray[0]);
                promise
                    .then((response) => {
                        logger.finishResponse(response);
                    })
                    .catch((reason) => {
                        logger.finishResponse(null, reason);
                    });
            },
        });
    }
}
function hc(config, listener) {
    return new Proxy(listener, {
        apply: function (_target, _thisArg, argArray) {
            const event = argArray[0];
            new LogWrapper(event, listener, config);
        },
    });
}
exports.hc = hc;
