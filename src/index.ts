import {
  createSlashCommandHandler,
  ApplicationCommand,
  InteractionHandler,
  Interaction,
  InteractionResponse,
  InteractionResponseType,
  EmbedType,
  ApplicationCommandOptionType,
} from '@glenstack/cf-workers-discord-bot'
//@ts-ignore
import { hc } from "./logging"

const cuteAnimal: ApplicationCommand = {
  name: 'cute-animal-pic',
  description: 'Send an adorable animal photo',
  options: [
    {
      name: 'animal',
      description: 'The type of animal.',
      type: ApplicationCommandOptionType.STRING,
      required: true,
      choices: [
        {
          name: 'Kangaroo',
          value: 'Kangaroo',
        },
        {
          name: 'Koala',
          value: 'Koala',
        },
        {
          name: 'Wombat',
          value: 'Wombat',
        },
        {
          name: 'Octopus',
          value: 'Octopus',
        },
      ],
    },
    {
      name: 'only_baby',
      description: 'Whether to show only baby animals',
      type: ApplicationCommandOptionType.BOOLEAN,
      required: false,
    },
  ],
}

const cuteHandler: InteractionHandler = async (
  interaction: Interaction,
): Promise<InteractionResponse> => {
  const userID = interaction.member.user.id
  const options = interaction.data.options
  const optionType = options && options[0].value
  const optionBaby = (options && options[1] && options[1].value) || false
  const picUrl = getUrl(optionType, optionBaby)

  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      content: `Hello, <@${userID}>!`,
      allowed_mentions: {
        users: [userID],
      },
      embeds: [
        {
          title: `Here's a cute ${optionType} picture:`,
          type: EmbedType.rich,
          description: `${optionBaby ? 'Baby ' : ''}${optionType}`,
          color: 3447003,
          image: {
            url: picUrl,
          },
        },
      ],
    },
  }
}

const animalPics = [
  {
    name: 'Kangaroo',
    value:
      'https://cdn.pixabay.com/photo/2019/04/11/13/45/joey-4119815_1280.jpg',
    baby: true,
  },
  {
    name: 'Kangaroo',
    value:
      'https://cdn.pixabay.com/photo/2017/04/12/01/08/kangaroo-2223331_1280.jpg',
    baby: false,
  },
  {
    name: 'Koala',
    value:
      'https://cdn.pixabay.com/photo/2016/04/15/23/19/female-koala-and-her-baby-1332217_1280.jpg',
    baby: true,
  },
  {
    name: 'Koala',
    value:
      'https://cdn.pixabay.com/photo/2020/01/10/20/28/australia-4756184_960_720.jpg',
    baby: false,
  },
  {
    name: 'Wombat',
    value:
      'https://cdn.pixabay.com/photo/2014/01/24/03/15/wombat-250858_960_720.jpg',
    baby: true,
  },
  {
    name: 'Wombat',
    value:
      'https://cdn.pixabay.com/photo/2017/06/02/06/16/wombats-2365429_960_720.jpg',
    baby: false,
  },
  {
    name: 'Octopus',
    value:
      'https://allthatsinteresting.com/wordpress/wp-content/uploads/2019/02/blue-ringed-octopus-spreading-out.jpg',
    baby: true,
  },
  {
    name: 'Octopus',
    value:
      'https://cdn.pixabay.com/photo/2016/04/01/08/33/animal-1298790_1280.png',
    baby: false,
  }

]

function getUrl(optionType: string, optionBaby: boolean) {
  return animalPics.find(
    (animal) => animal.name === optionType && animal.baby === optionBaby,
  ).value
}

const slashCommandHandler = createSlashCommandHandler({
  applicationID: "123456789",
  applicationSecret: APPLICATION_SECRET, // You should store this in a secret
  publicKey: "123456789",
  commands: [[cuteAnimal, cuteHandler]],
});

const config = {
  dataset: 'my-first-dataset',
  apiKey: '123456789',
}
const listener = hc(config, event => {
  return event.respondWith(slashCommandHandler(event.request))
})

addEventListener('fetch', listener)
