import { EmbedBuilder } from 'discord.js';
import { getGuildConfig } from './config/guildConfig.js';
import { logger } from '../utils/logger.js';

const DEFAULTS = { enabled: false, channelId: null, threshold: 3, emoji: '⭐', selfStar: false, ignoreBots: true };
const queues = new Map();
const keyFor = (guildId, messageId) => `starboard:${guildId}:${messageId}`;

export async function syncStarboardReaction(reaction, client) {
  let message = reaction.message;
  if (message.partial) message = await message.fetch();
  if (!message.guild || !message.author) return;

  // Serialize updates per source message so two near-simultaneous reactions
  // cannot cause the threshold-crossing update to be dropped.
  const queueKey = keyFor(message.guild.id, message.id);
  const previous = queues.get(queueKey) || Promise.resolve();
  const task = previous.catch(() => {}).then(() => syncStarboardMessage(reaction, message, client));
  queues.set(queueKey, task);
  try {
    await task;
  } finally {
    if (queues.get(queueKey) === task) queues.delete(queueKey);
  }
}

async function syncStarboardMessage(reaction, originalMessage, client) {
  // Refresh before reading counts; reaction events can arrive in quick bursts.
  const message = await originalMessage.fetch().catch(() => originalMessage);
  if (!message.guild || !message.author) return;
  const guildConfig = await getGuildConfig(client, message.guild.id);
  const cfg = { ...DEFAULTS, ...(guildConfig.starboard || {}) };
  if (!cfg.enabled || !cfg.channelId || reaction.emoji.toString() !== cfg.emoji || message.channel.id === cfg.channelId || (cfg.ignoredChannels || []).includes(message.channel.id)) return;
  if (cfg.ignoreBots && message.author.bot) return;

  const fullReaction = message.reactions.cache.find(r => r.emoji.toString() === cfg.emoji);
  const reactionUsers = await fullReaction?.users.fetch().catch(() => null);
  const authorStarred = Boolean(reactionUsers?.has(message.author.id));
  const count = Math.max(0, (fullReaction?.count ?? reaction.count ?? 0) - (!cfg.selfStar && authorStarred ? 1 : 0));
  const lockKey = keyFor(message.guild.id, message.id);
  const existing = await client.db.get(lockKey);
  const boardChannel = await message.guild.channels.fetch(cfg.channelId).catch(() => null);
  if (!boardChannel?.isTextBased() || !boardChannel.messages) return;

  if (count < cfg.threshold) {
    if (existing?.starboardMessageId) {
      const oldPost = await boardChannel.messages.fetch(existing.starboardMessageId).catch(() => null);
      if (oldPost) await oldPost.delete().catch(() => {});
      await client.db.delete(lockKey).catch(() => {});
    }
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xF1C40F)
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
    .setDescription(message.content?.slice(0, 3900) || '*No text content*')
    .addFields(
      { name: 'Source', value: `[Jump to message](${message.url})`, inline: true },
      { name: 'Channel', value: `${message.channel}`, inline: true },
    )
    .setFooter({ text: `${cfg.emoji} ${count} · ${message.id}` })
    .setTimestamp(message.createdAt);
  const attachment = message.attachments.first();
  if (attachment?.contentType?.startsWith('image/')) embed.setImage(attachment.url);
  else if (attachment) embed.addFields({ name: 'Attachment', value: `[${attachment.name || 'Open attachment'}](${attachment.url})`, inline: false });

  const oldPost = existing?.starboardMessageId
    ? await boardChannel.messages.fetch(existing.starboardMessageId).catch(() => null)
    : null;
  const payload = {
    content: `${cfg.emoji} **${count}** · ${message.channel}`,
    embeds: [embed],
    allowedMentions: { parse: [] },
  };
  if (oldPost) {
    await oldPost.edit(payload);
  } else {
    const post = await boardChannel.send(payload);
    await client.db.set(lockKey, {
      starboardMessageId: post.id,
      sourceMessageId: message.id,
      channelId: message.channel.id,
      createdAt: Date.now(),
    });
  }
}

export async function removeStarboardEntry(message, client) {
  if (!message.guild) return;
  const key = keyFor(message.guild.id, message.id);
  const entry = await client.db.get(key).catch(() => null);
  if (!entry) return;
  const config = await getGuildConfig(client, message.guild.id);
  const channel = await message.guild.channels.fetch(config.starboard?.channelId).catch(() => null);
  if (channel?.isTextBased() && entry.starboardMessageId) {
    const post = await channel.messages.fetch(entry.starboardMessageId).catch(() => null);
    if (post) await post.delete().catch(() => {});
  }
  await client.db.delete(key).catch(() => {});
}
