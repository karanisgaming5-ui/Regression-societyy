import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const cooldownMs = 24 * 60 * 60 * 1000;
const activeGivers = new Set();
const userKey = (g,u) => `guild:${g}:rep:user:${u}`;
const givenKey = (g,u) => `guild:${g}:rep:cooldown:${u}`;
export default {
  category: 'Community',
  data: new SlashCommandBuilder().setName('rep').setDescription('Give and browse community reputation').setDMPermission(false)
    .addSubcommand(s => s.setName('give').setDescription('Give reputation to a helpful member')
      .addUserOption(o => o.setName('user').setDescription('Member to appreciate').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Short reason (optional)').setMaxLength(180)))
    .addSubcommand(s => s.setName('top').setDescription('Show the reputation leaderboard'))
    .addSubcommand(s => s.setName('check').setDescription('Check a member reputation')
      .addUserOption(o => o.setName('user').setDescription('Member to check'))),
  async execute(interaction, _config, client) {
    const action = interaction.options.getSubcommand(), guildId = interaction.guildId;
    if (action === 'give') {
      const target = interaction.options.getUser('user');
      if (target.bot || target.id === interaction.user.id) return interaction.reply({ content: 'You can only give reputation to another human member.', ephemeral: true });
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (!member) return interaction.reply({ content: 'That member is not in this server.', ephemeral: true });
      const giverKey = `${guildId}:${interaction.user.id}`;
      if (activeGivers.has(giverKey)) return interaction.reply({ content: 'Your reputation action is already being processed.', ephemeral: true });
      activeGivers.add(giverKey);
      try {
        const key = givenKey(guildId, interaction.user.id), last = await client.db.get(key, 0), now = Date.now();
        if (now - last < cooldownMs) return interaction.reply({ content: `You can give reputation again <t:${Math.ceil((last + cooldownMs)/1000)}:R>.`, ephemeral: true });
        const fromKey = userKey(guildId, interaction.user.id), toKey = userKey(guildId, target.id);
        const [from, to] = await Promise.all([client.db.get(fromKey, {score:0,received:0,given:0}), client.db.get(toKey, {score:0,received:0,given:0})]);
        from.given = Number(from.given || 0) + 1;
        to.score = Number(to.score || 0) + 1; to.received = Number(to.received || 0) + 1;
        await client.db.set(fromKey, from); await client.db.set(toKey, to); await client.db.set(key, now);
        const reason = interaction.options.getString('reason');
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('Reputation given').setDescription(`${interaction.user} appreciated ${target}.\\n${reason ? `> ${reason}` : 'A little recognition goes a long way.'}`).setFooter({text:'One reputation point per member every 24 hours'})] });
      } finally {
        activeGivers.delete(giverKey);
      }
    }
    if (action === 'check') {
      const target = interaction.options.getUser('user') || interaction.user;
      const data = await client.db.get(userKey(guildId, target.id), {score:0,received:0,given:0});
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`${target.username} • Reputation`).setDescription(`**${Number(data.score||0).toLocaleString()}** reputation points\nReceived: ${data.received||0} · Given: ${data.given||0}`)] });
    }
    const keys = await client.db.list(`guild:${guildId}:rep:user:`);
    const rows = [];
    for (const key of keys) {
      const id = key.split(':').pop(), data = await client.db.get(key, null);
      if (data) rows.push({id, score:Number(data.score||0)});
    }
    rows.sort((a,b)=>b.score-a.score);
    const lines = await Promise.all(rows.slice(0,10).map(async (r,i) => {
      const user = await client.users.fetch(r.id).catch(()=>null);
      return `**${i+1}.** ${user ? user.username : `Member ${r.id.slice(-4)}`} — **${r.score}**`;
    }));
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🏆 Reputation leaderboard').setDescription(lines.join('\n') || 'No reputation has been given yet.').setFooter({text:`${rows.length} members on the board`})] });
  }
};
