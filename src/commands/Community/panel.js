import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
export default {
 category:'ServerStats',
 data:new SlashCommandBuilder().setName('panel').setDescription('Create polished server information and role panels')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false)
  .addSubcommand(s=>s.setName('create').setDescription('Post a custom server panel')
   .addChannelOption(o=>o.setName('channel').setDescription('Where to post the panel').addChannelTypes(ChannelType.GuildText).setRequired(true))
   .addStringOption(o=>o.setName('type').setDescription('Panel style').setRequired(true).addChoices(
    {name:'Information',value:'info'},{name:'Rules',value:'rules'},{name:'Support',value:'support'},{name:'Roles',value:'roles'},{name:'Tickets',value:'tickets'}))
   .addStringOption(o=>o.setName('title').setDescription('Panel heading').setMaxLength(180).setRequired(true))
   .addStringOption(o=>o.setName('description').setDescription('Panel content').setMaxLength(3500).setRequired(true))
   .addRoleOption(o=>o.setName('role').setDescription('Optional self-assignable role (Roles panel)'))
   .addStringOption(o=>o.setName('button_label').setDescription('Role button label').setMaxLength(80)))
  .addSubcommand(s=>s.setName('preview').setDescription('Preview the available panel types')),
 async execute(interaction) {
  if(!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({content:'Manage Server permission is required.',ephemeral:true});
  if(interaction.options.getSubcommand()==='preview') {
   const e=new EmbedBuilder().setColor(0x5865F2).setTitle('Regression Society • Panel styles').setDescription('**Information** — server guides and useful links\n**Rules** — community expectations\n**Support** — how to get help\n**Roles** — self-assignable role button\n**Tickets** — instructions for opening a support ticket');
   return interaction.reply({embeds:[e],ephemeral:true});
  }
  const channel=interaction.options.getChannel('channel'), type=interaction.options.getString('type'), title=interaction.options.getString('title'), description=interaction.options.getString('description'), role=interaction.options.getRole('role');
  if(type==='roles' && !role) return interaction.reply({content:'A Roles panel needs a role to assign.',ephemeral:true});
  if(type!=='roles' && role) return interaction.reply({content:'The role option is only used with a Roles panel.',ephemeral:true});
  if(role) {
   const botMember=interaction.guild.members.me || await interaction.guild.members.fetchMe();
   if(!botMember.permissions.has(PermissionFlagsBits.ManageRoles) || role.managed || role.id===interaction.guild.id || role.position>=botMember.roles.highest.position)
    return interaction.reply({content:'I cannot assign that role. Give me Manage Roles and place the target role below my highest role; managed and @everyone roles cannot be assigned.',ephemeral:true});
  }
  const embed=new EmbedBuilder().setColor(0x5865F2).setTitle(title).setDescription(description).setFooter({text:`Regression Society • ${type.toUpperCase()} PANEL`}).setTimestamp();
  const payload={embeds:[embed],allowedMentions:{parse:[]}};
  if(role) payload.components=[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rs_panel_role:${role.id}`).setLabel(interaction.options.getString('button_label')||`Get ${role.name}`).setStyle(ButtonStyle.Primary))];
  else if(type==='tickets') payload.components=[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rs_panel_ticket').setLabel(interaction.options.getString('button_label')||'Create a ticket').setStyle(ButtonStyle.Success).setEmoji('🎫'))];
  const sent=await channel.send(payload);
  return interaction.reply({content:`Your ${type} panel has been posted in ${channel}: [Jump to panel](${sent.url})`,ephemeral:true});
 }
};
