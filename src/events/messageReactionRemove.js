import { Events } from 'discord.js';
import { syncStarboardReaction } from '../services/starboardService.js';
export default { name: Events.MessageReactionRemove, async execute(reaction, user, client) {
  if (user?.bot) return;
  await syncStarboardReaction(reaction, client);
} };
