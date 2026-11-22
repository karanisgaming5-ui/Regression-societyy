import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
const key=(g,c)=>`guild:${g}:sticky:${c}`;
export default {
 category:'ServerStats',
 data:new SlashCommandBuilder().setName('sticky').setDescription('Manage persistent channel sticky notes')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).setDMPermission(false)
  .addSubcommand(s=>s.setName('set').setDescription('Add a sticky note (up to five per channel)')
   .addChannelOption(o=>o.setName('channel').setDescription('Target channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
   .addStringOption(o=>o.setName('message').setDescription('Sticky note content').setMaxLength(1800).setRequired(true)))
  .addSubcommand(s=>s.setName('edit').setDescription('Edit an existing sticky note')
   .addChannelOption(o=>o.setName('channel').setDescription('Target channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
   .addStringOption(o=>o.setName('note_id').setDescription('ID shown by /sticky list').setRequired(true))
   .addStringOption(o=>o.setName('message').setDescription('Updated note content').setMaxLength(1800).setRequired(true)))
  .addSubcommand(s=>s.setName('remove').setDescription('Remove one sticky note')
   .addChannelOption(o=>o.setName('channel').setDescription('Target channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
   .addStringOption(o=>o.setName('note_id').setDescription('ID shown by /sticky list').setRequired(true)))
  .addSubcommand(s=>s.setName('list').setDescription('List configured sticky notes')
   .addChannelOption(o=>o.setName('channel').setDescription('Optional channel to inspect').addChannelTypes(ChannelType.GuildText)))
  .addSubcommand(s=>s.setName('pause').setDescription('Pause or resume a sticky note')
   .addChannelOption(o=>o.setName('channel').setDescription('Target channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
   .addStringOption(o=>o.setName('note_id').setDescription('ID shown by /sticky list').setRequired(true))
   .addBooleanOption(o=>o.setName('paused').setDescription('Pause reposting').setRequired(true))),
 async execute(interaction,_config,client) {
  if(!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({content:'Manage Messages permission is required.',ephemeral:true});
  const action=interaction.options.getSubcommand(), g=interaction.guildId;
  if(action==='list') {
   const channel=interaction.options.getChannel('channel');
   const keys=channel?[key(g,channel.id)]:await client.db.list(`guild:${g}:sticky:`), lines=[];
   for(const k of keys){const c=k.split(':').pop(),data=await client.db.get(k,{notes:[]});for(const n of data.notes||[])lines.push(`<#${c}> · \`${n.id}\` · ${n.paused?'Paused':'Active'} · ${n.content.slice(0,90).replace(/\n/g,' ')}`);}
   return interaction.reply({embeds:[new EmbedBuilder().setColor(0x5865F2).setTitle('📌 Sticky notes').setDescription(lines.join('\n')||'No sticky notes configured.').setFooter({text:`${lines.length}/5 per channel maximum`})],ephemeral:true});
  }
  const channel=interaction.options.getChannel('channel'), k=key(g,channel.id), data=await client.db.get(k,{notes:[]}), notes=data.notes||[];
  if(action==='set') {
   if(notes.length>=5) return interaction.reply({content:'This channel already has five sticky notes. Remove one before adding another.',ephemeral:true});
   const id=Math.random().toString(36).slice(2,7).toUpperCase();
   const content=interaction.options.getString('message');
   const posted=await channel.send({embeds:[new EmbedBuilder().setColor(0x5865F2).setDescription(content).setFooter({text:`📌 Sticky note ${id} • Regression Society`})],allowedMentions:{parse:[]}});
   notes.push({id,content,paused:false,messageId:posted.id});
   await client.db.set(k,{notes});
   return interaction.reply({content:`Sticky note \`${id}\` added to ${channel}. Use \`/sticky list\` to manage it.`,ephemeral:true});
  }
  const id=interaction.options.getString('note_id'), index=notes.findIndex(n=>n.id===id);
  if(index<0) return interaction.reply({content:'Sticky note ID not found. Use `/sticky list` to see valid IDs.',ephemeral:true});
  if(action==='edit') {
   notes[index].content=interaction.options.getString('message');
   if(notes[index].messageId) {
    const old=await channel.messages.fetch(notes[index].messageId).catch(()=>null);
    if(old) await old.edit({embeds:[new EmbedBuilder().setColor(0x5865F2).setDescription(notes[index].content).setFooter({text:`📌 Sticky note ${id} • Regression Society`})],allowedMentions:{parse:[]}});
   }
  }
  if(action==='pause') notes[index].paused=interaction.options.getBoolean('paused');
  if(action==='remove') {
   if(notes[index].messageId) await channel.messages.delete(notes[index].messageId).catch(()=>{});
   notes.splice(index,1);
  }
  await client.db.set(k,{notes});
  return interaction.reply({content:action==='edit'?`Sticky note \`${id}\` updated.`:action==='pause'?`Sticky note \`${id}\` ${notes[index].paused?'paused':'resumed'}.`:`Sticky note \`${id}\` removed from ${channel}.`,ephemeral:true});
 }
};
