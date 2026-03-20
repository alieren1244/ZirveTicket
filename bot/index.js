require("dotenv").config();
const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
} = require("discord.js");

const LOG_CHANNEL_ID = "1395722793915519026";

const CATEGORY_MAP = {
  hr: {
    labelTr: "İnsan Kaynakları",
    labelEn: "Human Resources",
    channelCategoryId: "1395796764493090846",
    emoji: "👥",
    prefix: "hr",
    description: "Recruitment, membership and internal team applications",
  },
  slot: {
    labelTr: "Slot Seçimi",
    labelEn: "Slot Selection",
    channelCategoryId: "1395722328607952999",
    emoji: "🎟️",
    prefix: "slot",
    description: "Slot requests and reservation processes",
  },
  convoy: {
    labelTr: "Konvoy Daveti",
    labelEn: "Convoy Invitation",
    channelCategoryId: "1395722333104115815",
    emoji: "🚛",
    prefix: "convoy",
    description: "Official convoy invitations and event participation requests",
  },
  partner: {
    labelTr: "Partner",
    labelEn: "Partnership",
    channelCategoryId: "1395722293841498234",
    emoji: "🤝",
    prefix: "partner",
    description: "Partnership and collaboration requests",
  },
};

const DATA_DIR = path.join(__dirname, "data");
const STATE_PATH = path.join(DATA_DIR, "state.json");

function ensureState() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(STATE_PATH)) {
    fs.writeFileSync(
      STATE_PATH,
      JSON.stringify(
        {
          counters: {
            hr: 0,
            slot: 0,
            convoy: 0,
            partner: 0,
          },
          claims: {},
          blacklistedUsers: [],
        },
        null,
        2
      ),
      "utf8"
    );
  }
}

function readState() {
  ensureState();
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
}

function writeState(data) {
  ensureState();
  fs.writeFileSync(STATE_PATH, JSON.stringify(data, null, 2), "utf8");
}

function nextNumber(categoryKey) {
  const state = readState();
  state.counters[categoryKey] = (state.counters[categoryKey] || 0) + 1;
  writeState(state);
  return state.counters[categoryKey];
}

function setClaim(channelId, userId) {
  const state = readState();
  state.claims[channelId] = userId;
  writeState(state);
}

function getClaim(channelId) {
  const state = readState();
  return state.claims[channelId] || null;
}

function clearClaim(channelId) {
  const state = readState();
  delete state.claims[channelId];
  writeState(state);
}

function isBlacklisted(userId) {
  const state = readState();
  return state.blacklistedUsers.includes(userId);
}

function getTicketOwnerFromChannel(channel) {
  const topic = channel.topic || "";
  const match = topic.match(/owner:(\d+)/);
  return match ? match[1] : null;
}

function isTicketChannel(channel) {
  return (
    channel &&
    channel.type === ChannelType.GuildText &&
    typeof channel.topic === "string" &&
    channel.topic.includes("zirve_ticket:true")
  );
}

function sanitizeUsername(username) {
  return username
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 10) || "user";
}

function formatTicketName(categoryKey, username) {
  const config = CATEGORY_MAP[categoryKey];
  const no = String(nextNumber(categoryKey)).padStart(2, "0");
  return `${config.prefix}-${sanitizeUsername(username)}-${no}`;
}

function getOpenTicketByUser(guild, userId) {
  return guild.channels.cache.find(
    (c) => isTicketChannel(c) && getTicketOwnerFromChannel(c) === userId
  );
}

async function sendLog(guild, embed) {
  try {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel || logChannel.type !== ChannelType.GuildText) return;
    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Log hatası:", error);
  }
}

function buildMainPanelEmbedTR() {
  return new EmbedBuilder()
    .setColor(0xea580c)
    .setTitle("🎫 Zirve Group Destek Merkezi")
    .setDescription(
`<:Balant:1038559583792279592> **Etkinlik Bileti Oluşturma**

*𝐙𝐢𝐫𝐯𝐞 𝐆𝐫𝐨𝐮𝐩 olarak, etkinlik taleplerinizi değerlendirme sürecimiz belirli kriterlere dayanmaktadır. Lütfen taleplerinizi aşağıdaki kurallar doğrultusunda oluşturunuz.*

<:Liste:1289694216796111019> **Kabul Edilmeyen Talepler** <a:JETX:1296885473758810112>

<:SariNokta:1289694521461964810> *Cuma ve Cumartesi haricindeki günlerde yapılan etkinlik talepleri. (Özel Günler Dahil)*
<:SariNokta:1289694521461964810> *18:30 UTC (21:30) öncesinde başlayan etkinlikler.*
<:SariNokta:1289694521461964810> *Konvoy kontrolü sağlanmayan etkinlikler.* **(CC Ekibi Bulunmayan)**
<:SariNokta:1289694521461964810> *Yeni açılan ekiplerden gelen davetler.*
<:SariNokta:1289694521461964810> *Slotları paylaşılmamış etkinlik davetleri.*`
    )
    .setFooter({ text: "Zirve Group Ticket System" });
}

function buildMainPanelEmbedEN() {
  return new EmbedBuilder()
    .setColor(0xfacc15)
    .setTitle("📌 Creating an Event Ticket")
    .setDescription(
`*As 𝐙𝐢𝐫𝐯𝐞 𝐆𝐫𝐨𝐮𝐩, our evaluation process for your event requests is based on certain criteria. Please create your requests in accordance with the rules below.*

**Requests Not Accepted**

• *Event requests made on days other than Friday and Saturday. (Including Special Days)*
• *Events starting before 18:30 UTC (21:30).*
• *Events without convoy control.* **(No CC Team)**
• *Invitations from newly opened teams.*
• *Event invitations with unshared slots.*`
    );
}

function buildCategoryInfoEmbed() {
  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle("Departments")
    .addFields(
      {
        name: "👥 Human Resources",
        value: "Recruitment, membership and internal team applications",
        inline: false,
      },
      {
        name: "🎟️ Slot Selection",
        value: "Slot requests and reservation processes",
        inline: false,
      },
      {
        name: "🚛 Convoy Invitation",
        value: "Official convoy invitations and event participation requests",
        inline: false,
      },
      {
        name: "🤝 Partnership",
        value: "Partnership and collaboration requests",
        inline: false,
      }
    );
}

function buildPanelComponents() {
  const select = new StringSelectMenuBuilder()
    .setCustomId("ticket_category_select")
    .setPlaceholder("Bir kategori seç | Select a category")
    .addOptions([
      {
        label: "İnsan Kaynakları | Human Resources",
        description: "Recruitment and HR requests",
        value: "hr",
        emoji: "👥",
      },
      {
        label: "Slot Seçimi | Slot Selection",
        description: "Slot request tickets",
        value: "slot",
        emoji: "🎟️",
      },
      {
        label: "Konvoy Daveti | Convoy Invitation",
        description: "Official convoy invitations",
        value: "convoy",
        emoji: "🚛",
      },
      {
        label: "Partner | Partnership",
        description: "Partnership and collaboration requests",
        value: "partner",
        emoji: "🤝",
      },
    ]);

  return [new ActionRowBuilder().addComponents(select)];
}

function buildTicketButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_claim")
        .setLabel("Claim Ticket")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("Close Request")
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

function buildTicketCreatedEmbed(user, config) {
  return new EmbedBuilder()
    .setColor(0xf97316)
    .setTitle("✅ Request Registered")
    .setDescription(
`Your request has been successfully forwarded to the relevant department. Please explain your request clearly and wait for the authorized team to review your ticket.

**Department:** ${config.labelEn}
**Bölüm:** ${config.labelTr}

Talebiniz ilgili birime iletilmiştir. Lütfen isteğinizi açık ve net şekilde belirtin, ardından yetkili ekibin incelemesini bekleyin.`
    )
    .addFields({
      name: "Opened By",
      value: `${user.tag}`,
      inline: true,
    })
    .setFooter({ text: "Zirve Group Request Desk" });
}

function buildLogEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel],
});

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Botun çalışıp çalışmadığını test eder."),
  new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("Ticket panelini gönderir.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("blacklist-add")
    .setDescription("Kullanıcıyı blacklist'e ekler.")
    .addUserOption((o) =>
      o.setName("user").setDescription("Kullanıcı").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName("blacklist-remove")
    .setDescription("Kullanıcıyı blacklist'ten çıkarır.")
    .addUserOption((o) =>
      o.setName("user").setDescription("Kullanıcı").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map((cmd) => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

client.once(Events.ClientReady, async () => {
  console.log(`Bot giriş yaptı: ${client.user.tag}`);
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("Komutlar yüklendi.");
  } catch (error) {
    console.error("Komut yükleme hatası:", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "ping") {
        return await interaction.reply({
          content: "Pong! Bot aktif.",
          ephemeral: true,
        });
      }

      if (interaction.commandName === "ticket-panel") {
        return await interaction.reply({
          embeds: [
            buildMainPanelEmbedTR(),
            buildMainPanelEmbedEN(),
            buildCategoryInfoEmbed(),
          ],
          components: buildPanelComponents(),
        });
      }

      if (interaction.commandName === "blacklist-add") {
        const user = interaction.options.getUser("user", true);
        const state = readState();
        if (!state.blacklistedUsers.includes(user.id)) {
          state.blacklistedUsers.push(user.id);
          writeState(state);
        }
        return await interaction.reply({
          content: `${user.tag} blacklist'e eklendi.`,
          ephemeral: true,
        });
      }

      if (interaction.commandName === "blacklist-remove") {
        const user = interaction.options.getUser("user", true);
        const state = readState();
        state.blacklistedUsers = state.blacklistedUsers.filter((id) => id !== user.id);
        writeState(state);
        return await interaction.reply({
          content: `${user.tag} blacklist'ten çıkarıldı.`,
          ephemeral: true,
        });
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "ticket_category_select") {
        await interaction.deferReply({ ephemeral: true });

        const selected = interaction.values[0];
        const config = CATEGORY_MAP[selected];

        if (!config) {
          return await interaction.editReply({
            content: "Geçersiz kategori seçimi.",
          });
        }

        if (isBlacklisted(interaction.user.id)) {
          return await interaction.editReply({
            content: "Ticket sistemi kullanımın kapatılmış.",
          });
        }

        const existing = getOpenTicketByUser(interaction.guild, interaction.user.id);
        if (existing) {
          return await interaction.editReply({
            content: `Zaten açık bir ticketın var: ${existing}`,
          });
        }

        const channelName = formatTicketName(selected, interaction.user.username);

        const channel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: config.channelCategoryId,
          topic: `zirve_ticket:true|owner:${interaction.user.id}|type:${selected}`,
          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: [PermissionsBitField.Flags.ViewChannel],
            },
            {
              id: interaction.user.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles,
              ],
            },
            {
              id: client.user.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.AttachFiles,
              ],
            },
          ],
        });

        await channel.send({
          content: `<@${interaction.user.id}>`,
          embeds: [buildTicketCreatedEmbed(interaction.user, config)],
          components: buildTicketButtons(),
        });

        await sendLog(
          interaction.guild,
          buildLogEmbed(
            "Ticket Opened",
            `A new request has been created.

**User:** ${interaction.user.tag}
**Department:** ${config.labelEn}
**Channel:** ${channel}`
          )
        );

        return await interaction.editReply({
          content: `Ticket başarıyla açıldı: ${channel}`,
        });
      }
    }

    if (interaction.isButton()) {
      if (!isTicketChannel(interaction.channel)) {
        return await interaction.reply({
          content: "Bu buton burada kullanılamaz.",
          ephemeral: true,
        });
      }

      if (interaction.customId === "ticket_claim") {
        const existingClaim = getClaim(interaction.channel.id);

        if (existingClaim && existingClaim !== interaction.user.id) {
          return await interaction.reply({
            content: `Bu talep zaten <@${existingClaim}> tarafından üstlenildi.`,
            ephemeral: true,
          });
        }

        setClaim(interaction.channel.id, interaction.user.id);

        await sendLog(
          interaction.guild,
          buildLogEmbed(
            "Ticket Claimed",
            `This request has been assigned to an authorized staff member.

**Staff:** ${interaction.user.tag}
**Channel:** #${interaction.channel.name}`
          )
        );

        return await interaction.reply({
          content: `${interaction.user} bu ticketı üzerine aldı.`,
          ephemeral: false,
        });
      }

      if (interaction.customId === "ticket_close") {
        await interaction.reply({
          content: "Talep 3 saniye içinde kapatılacak.",
          ephemeral: true,
        });

        await sendLog(
          interaction.guild,
          buildLogEmbed(
            "Ticket Closed",
            `The request has been closed and archived.

**Closed By:** ${interaction.user.tag}
**Channel:** #${interaction.channel.name}`
          )
        );

        clearClaim(interaction.channel.id);

        setTimeout(async () => {
          try {
            await interaction.channel.delete();
          } catch (error) {
            console.error("Kanal silme hatası:", error);
          }
        }, 3000);

        return;
      }
    }
  } catch (error) {
    console.error("Interaction hatası:", error);

    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: "Bir hata oluştu." });
      } else if (!interaction.replied) {
        await interaction.reply({
          content: "Bir hata oluştu.",
          ephemeral: true,
        });
      }
    } catch {}
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.log("DISCORD_TOKEN eksik. .env dosyasını doldur.");
} else {
  client.login(process.env.DISCORD_TOKEN);
}