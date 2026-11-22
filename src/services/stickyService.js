import { EmbedBuilder } from 'discord.js';

export async function refreshStickyNote(message, client) {
  if (!message?.guild || !message.channel?.isTextBased() || message.author?.bot) return;
  const key = `guild:${message.guild.id}:sticky:${message.channel.id}`;
  const data = await client.db.get(key, { notes: [] }).catch(() => ({ notes: [] }));
  const notes = (data.notes || []).filter(note => !note.paused && note.content);
  if (!notes.length) return;
  const updated = [...(data.notes || [])];
  for (const note of notes) {
    if (note.lastTriggerId === message.id) continue;
    const embed = new EmbedBuilder().setColor(0x5865F2).setDescription(note.content.slice(0, 3900))
      .setFooter({ text: `📌 Sticky note ${note.id} • Regression Society` });
    const posted = await message.channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    const stored = updated.find(n => n.id === note.id);
    if (stored) { stored.messageId = posted.id; stored.lastTriggerId = message.id; }
    if (note.messageId && note.messageId !== posted.id) await message.channel.messages.delete(note.messageId).catch(() => {});
  }
  await client.db.set(key, { ...data, notes: updated });
}
