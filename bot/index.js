require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
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

const PORT = process.env.PORT || 3000;
const PANEL_API_KEY = process.env.PANEL_API_KEY || "zirve-panel-key";
const SETTINGS_PATH = path.resolve(__dirname, "..", "shared", "settings.json");
const DATA_DIR = path.join(__dirname, "data");
const STATE_PATH = path.join(DATA_DIR, "state.json");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function ensureFile(filePath, fallback) {
  ensureDir(path.dirname(filePath));
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), "utf8");
  }
}

function readJson(filePath, fallback) {
  ensureFile(filePath, fallback);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`JSON okuma hatası: ${filePath}`, error);
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function getDefaultSettings() {
  return {
    botName: "Zirve Ticket",
    panelTitle: "Zirve Group Support Center",
    panelSubtitle: "Advanced Ticket Administration",
    panelDescription:
      "Taleplerin hızlı, düzenli ve profesyonel değerlendirilmesi için uygun departmanı seçin.",
    logChannelId: "1395722793915519026",
    transcriptChannelId: "1395722793915519026",
    defaultSupportRoleId: "",
    archiveCategoryId: "",
    blacklistRoleId: "",
    maxTicketsPerUser: 2,
    transcriptEnabled: true,
    claimEnabled: true,
    blacklistEnabled: true,
    renameEnabled: true,
    addRemoveEnabled: true,
    satisfactionEnabled: true,
    multiLanguage: true,
    closeReasonEnabled: true,
    autoCloseInactive: true,
    dmNotifications: true,
    requireCategoryChoice: true,
    showTicketNumber: true,
    autoTagSupport: true,
    antiSpamEnabled: true,
    backupEnabled: true,
    categories: [
      {
        key: "hr",
        name: "İnsan Kaynakları",
        english: "Human Resources",
        emoji: "👥",
        categoryId: "1395796764493090846",
        supportRole: "",
        logChannel: "1395722793915519026",
        priority: "Normal",
        enabled: true,
        requireReason: true,
        autoTranscript: true,
      },
      {
        key: "slot",
        name: "Slot Seçimi",
        english: "Slot Selection",
        emoji: "🎟️",
        categoryId: "1395722328607952999",
        supportRole: "",
        logChannel: "1395722793915519026",
        priority: "Normal",
        enabled: true,
        requireReason: true,
        autoTranscript: true,
      },
      {
        key: "convoy",
        name: "Konvoy Daveti",
        english: "Convoy Invitation",
        emoji: "🚛",
        categoryId: "1395722333104115815",
        supportRole: "",
        logChannel: "1395722793915519026",
        priority: "Yüksek",
        enabled: true,
        requireReason: true,
        autoTranscript: true,
      },
      {
        key: "partner",
        name: "Partner",
        english: "Partnership",
        emoji: "🤝",
        categoryId: "1395722293841498234",
        supportRole: "",
        logChannel: "1395722793915519026",
        priority: "Yüksek",
        enabled: true,
        requireReason: true,
        autoTranscript: true,
      },
    ],
  };
}

function getDefaultState() {
  return {
    counters: {},
    claims: {},
    blacklistedUsers: [],
  };
}

function getSettings() {
  return readJson(SETTINGS_PATH, getDefaultSettings());
}

function saveSettings(data) {
  writeJson(SETTINGS_PATH, data);
}

function getState() {
  return readJson(STATE_PATH, getDefaultState());
}

function saveState(state) {
  writeJson(STATE_PATH, state);
}

function nextTicketNumber(categoryKey) {
  const state = getState();
  state.counters[categoryKey] = (state.counters[categoryKey] || 0) + 1;
  saveState(state);
  return state.counters[categoryKey];
}

function getClaim(channelId) {
  return getState().claims[channelId] || null;
}

function setClaim(channelId, userId) {
  const state = getState();
  state.claims[channelId] = userId;
  saveState(state);
}

function clearClaim(channelId) {
  const state = getState();
  delete state.claims[channelId];
  saveState(state);
}

function isBlacklisted(userId) {
  return getState().blacklistedUsers.includes(userId);
}

function getTicketOwnerFromChannel(channel) {
  const topic = channel?.topic || "";
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

function sanitizeName(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12) || "user";
}

function countOpenTicketsForUser(guild, userId) {
  return guild.channels.cache.filter(
    (c) => isTicketChannel(c) && getTicketOwnerFromChannel(c) === userId
  ).size;
}

function getCategoryConfig(key) {
  const settings = getSettings();
  return (settings.categories || []).find((c) => c.key === key);
}

function buildPanelEmbeds(settings) {
  const tr = new EmbedBuilder()
    .setColor(0xea580c)
    .setTitle("🎫 " + (settings.panelTitle || "Zirve Group Destek Merkezi"))
    .setDescription(
      `${settings.panelDescription || "Lütfen uygun departmanı seçin."}\n\n` +
        `**Etkinlik Bileti Oluşturma**\n` +
        `• Cuma ve Cumartesi dışındaki etkinlik talepleri kabul edilmez.\n` +
        `• 18:30 UTC öncesi başlayan etkinlikler kabul edilmez.\n` +
        `• CC ekibi olmayan etkinlikler kabul edilmez.\n` +
        `• Yeni açılmış ekiplerden gelen davetler kabul edilmez.\n` +
        `• Slot bilgisi paylaşılmamış davetler kabul edilmez.`
    )
    .setFooter({ text: settings.botName || "Zirve Ticket" });

  const en = new EmbedBuilder()
    .setColor(0xfacc15)
    .setTitle("📌 Creating an Event Ticket")
    .setDescription(
      `Please choose the correct department before creating a request.\n\n` +
        `**Requests Not Accepted**\n` +
        `• Events outside Friday and Saturday\n` +
        `• Events starting before 18:30 UTC\n` +
        `• Events without convoy control team\n` +
        `• Invitations from newly opened teams\n` +
        `• Invitations with unshared slot information`
    );

  return [tr, en];
}

function buildPanelComponents(settings) {
  const enabledCategories = (settings.categories || []).filter((c) => c.enabled);

  if (!enabledCategories.length) {
    const disabledButton = new ButtonBuilder()
      .setCustomId("ticket_disabled")
      .setLabel("Kategori Yok")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    return [new ActionRowBuilder().addComponents(disabledButton)];
  }

  const options = enabledCategories.slice(0, 25).map((c) => ({
    label: `${c.name} | ${c.english}`.slice(0, 100),
    description: `${c.priority} öncelik`.slice(0, 100),
    value: c.key,
    emoji: c.emoji || "🎫",
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId("ticket_category_select")
    .setPlaceholder("Bir kategori seç | Select a category")
    .addOptions(options);

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

function buildTicketEmbed(user, category, settings) {
  return new EmbedBuilder()
    .setColor(0xf97316)
    .setTitle("✅ Request Registered")
    .setDescription(
      `Your request has been forwarded to the relevant department.\n\n` +
        `**Department:** ${category.english}\n` +
        `**Bölüm:** ${category.name}\n\n` +
        `Talebiniz ilgili birime iletilmiştir. Lütfen isteğinizi açık ve net şekilde belirtin.`
    )
    .addFields(
      { name: "Opened By", value: user.tag, inline: true },
      { name: "Priority", value: category.priority || "Normal", inline: true }
    )
    .setFooter({ text: settings.botName || "Zirve Ticket" });
}

async function sendLog(guild, title, description) {
  try {
    const settings = getSettings();
    const logChannelId = settings.logChannelId || "1395722793915519026";
    const channel = guild.channels.cache.get(logChannelId);

    if (!channel || channel.type !== ChannelType.GuildText) return;

    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle(title)
      .setDescription(description)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Log gönderme hatası:", error);
  }
}

/* ---------------- API ---------------- */

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/", (req, res) => {
  res.send("Zirve Ticket API aktif.");
});

app.get("/api/settings", (req, res) => {
  res.json(getSettings());
});

app.post("/api/settings", (req, res) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== PANEL_API_KEY) {
    return res.status(401).json({ error: "Yetkisiz istek" });
  }

  try {
    const body = req.body;
    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "Geçersiz veri" });
    }

    saveSettings(body);
    return res.json({ ok: true });
  } catch (error) {
    console.error("API kayıt hatası:", error);
    return res.status(500).json({ error: "Kayıt hatası" });
  }
});

app.listen(PORT, () => {
  console.log("API server aktif:", PORT);
});

/* ---------------- BOT ---------------- */

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel],
});

const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Bot çalışıyor mu"),
  new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("Ticket panelini gönderir")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map((cmd) => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

client.once(Events.ClientReady, async () => {
  console.log(`Bot giriş yaptı: ${client.user.tag}`);

  try {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
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
          content: "Pong!",
          ephemeral: true,
        });
      }

      if (interaction.commandName === "ticket-panel") {
        const settings = getSettings();
        return await interaction.reply({
          embeds: buildPanelEmbeds(settings),
          components: buildPanelComponents(settings),
        });
      }
    }

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "ticket_category_select"
    ) {
      await interaction.deferReply({ ephemeral: true });

      const settings = getSettings();
      const categoryKey = interaction.values[0];
      const category = getCategoryConfig(categoryKey);

      if (!category || !category.enabled) {
        return await interaction.editReply({
          content: "Geçersiz kategori.",
        });
      }

      if (settings.blacklistEnabled && isBlacklisted(interaction.user.id)) {
        return await interaction.editReply({
          content: "Ticket sistemi kullanımın kapatılmış.",
        });
      }

      const openCount = countOpenTicketsForUser(
        interaction.guild,
        interaction.user.id
      );

      if (openCount >= (settings.maxTicketsPerUser || 1)) {
        return await interaction.editReply({
          content: `Maksimum açık ticket limitine ulaştın. Limit: ${settings.maxTicketsPerUser || 1}`,
        });
      }

      if (!category.categoryId) {
        return await interaction.editReply({
          content: "Bu kategori için Discord kategori ID ayarlanmamış.",
        });
      }

      const ticketNo = settings.showTicketNumber
        ? String(nextTicketNumber(categoryKey)).padStart(2, "0")
        : "00";

      const channelName = `${categoryKey}-${sanitizeName(
        interaction.user.username
      )}-${ticketNo}`;

      const permissionOverwrites = [
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
      ];

      const supportRole = category.supportRole || settings.defaultSupportRoleId;
      if (supportRole && /^\d+$/.test(String(supportRole))) {
        permissionOverwrites.push({
          id: supportRole,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        });
      }

      const channel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category.categoryId,
        topic: `zirve_ticket:true|owner:${interaction.user.id}|type:${categoryKey}`,
        permissionOverwrites,
      });

      const content =
        settings.autoTagSupport &&
        supportRole &&
        /^\d+$/.test(String(supportRole))
          ? `<@&${supportRole}> <@${interaction.user.id}>`
          : `<@${interaction.user.id}>`;

      await channel.send({
        content,
        embeds: [buildTicketEmbed(interaction.user, category, settings)],
        components: buildTicketButtons(),
      });

      await sendLog(
        interaction.guild,
        "Ticket Opened",
        `User: ${interaction.user.tag}\nDepartment: ${category.english}\nChannel: ${channel}`
      );

      return await interaction.editReply({
        content: `Ticket açıldı: ${channel}`,
      });
    }

    if (interaction.isButton()) {
      if (!isTicketChannel(interaction.channel)) {
        return await interaction.reply({
          content: "Bu işlem sadece ticket kanalında kullanılabilir.",
          ephemeral: true,
        });
      }

      if (interaction.customId === "ticket_claim") {
        const settings = getSettings();

        if (!settings.claimEnabled) {
          return await interaction.reply({
            content: "Claim sistemi kapalı.",
            ephemeral: true,
          });
        }

        const existingClaim = getClaim(interaction.channel.id);
        if (existingClaim && existingClaim !== interaction.user.id) {
          return await interaction.reply({
            content: `Bu ticket zaten <@${existingClaim}> tarafından üstlenildi.`,
            ephemeral: true,
          });
        }

        setClaim(interaction.channel.id, interaction.user.id);

        await sendLog(
          interaction.guild,
          "Ticket Claimed",
          `Staff: ${interaction.user.tag}\nChannel: #${interaction.channel.name}`
        );

        return await interaction.reply({
          content: `${interaction.user} bu ticketı üzerine aldı.`,
          ephemeral: false,
        });
      }

      if (interaction.customId === "ticket_close") {
        await interaction.reply({
          content: "Ticket 3 saniye içinde kapatılacak.",
          ephemeral: true,
        });

        clearClaim(interaction.channel.id);

        await sendLog(
          interaction.guild,
          "Ticket Closed",
          `By: ${interaction.user.tag}\nChannel: #${interaction.channel.name}`
        );

        setTimeout(async () => {
          try {
            await interaction.channel.delete();
          } catch (error) {
            console.error("Kanal silme hatası:", error);
          }
        }, 3000);
      }
    }
  } catch (error) {
    console.error("Interaction hatası:", error);

    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: "Bir hata oluştu. Konsol logunu kontrol et.",
        });
      } else if (!interaction.replied) {
        await interaction.reply({
          content: "Bir hata oluştu. Konsol logunu kontrol et.",
          ephemeral: true,
        });
      }
    } catch {}
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.log("DISCORD_TOKEN eksik.");
} else {
  client.login(process.env.DISCORD_TOKEN);
}