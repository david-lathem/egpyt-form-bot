require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events,
  PermissionFlagsBits,
  LabelBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelType,
} = require("discord.js");
const axios = require("axios");
const { default: OpenAI } = require("openai");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

const openaiClient = new OpenAI({});

client.once("clientReady", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on("guildMemberAdd", async (member) => {
  try {
    if (member.guild.id !== process.env.GUILD_ID) return;

    await member.roles.add(process.env.UNVERIFIED_ROLE_ID);

    await member.send(`👋 Welcome to Halal Hustle
🔓 Unlock full access in 30 seconds
Complete the quick verification below.
👉 Verify now: <#1436722972994961478>
✅ Instant access to all channels + free value
🔒 Verification keeps the community safe
⚠️ We never DM for payments or passwords`);
  } catch (error) {
    console.error(error);
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;

    if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
      return;

    if (message.content !== "!send_verify_button") return;

    await message.delete().catch(() => {});

    const embed = new EmbedBuilder()
      .setColor("#2b6df3")
      .setTitle("✅ Verify Your Account")
      .setDescription(
        "To get verified, please fill out the form including your **Name**, **Email**, **Phone Number**, and **Country**.\n\nClick the **Verify** button below to begin.",
      )
      .setFooter({ text: "Halal Ecom • Secure & Fast" })
      .setTimestamp();

    const verifyButton = new ButtonBuilder()
      .setCustomId("verify_button")
      .setLabel("Verify")
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(verifyButton);

    await message.channel.send({
      embeds: [embed],
      components: [row],
    });
  } catch (err) {
    console.error(err);
  }
});

const WHITE_LISTED_ROLE_IDS = process.env.WHITE_LISTED_ROLE_IDS.split(",");
const FREE_CHANNEL_ID = process.env.FREE_CHANNEL_ID;
const LINK_REGEX =
  /(https?:\/\/[^\s]+)|(bit\.ly\/[^\s]+)|(tinyurl\.com\/[^\s]+)|(facebook\.com\/[^\s]+)|(t\.me\/[^\s]+)/i;

const BAN_REGEX =
  /\b(dm\s*me|message\s*me|hit\s*me\s*up|contact\s*me|pm\s*me|direct\s*message\s*me|private\s*message\s*me|i\s*can\s*help|i\s*offer|my\s*service|my\s*services|my\s*agency|agency|free\s*consultation|paid\s*call|looking\s*for\s*clients|who\s*wants\s*help|i\s*sell|check\s*my|join\s*my|telegram|whatsapp|signal|crypto|forex|airdrop|nft|wallet|send\s*money|scam|scammer|fake)\b/i;

const CTA_KEYWORDS = /\b(session|webinar|live|training|workshop)\b/i;

const MESSAGE_CACHE = new Map(); // key: userId, value: array of messages with timestamp

const MUTE_DURATION = 15 * 60 * 1000; // 15 minutes in ms
const MAX_MESSAGES = 5; // 5 messages
const TIME_WINDOW = 5000; // 5 seconds

client.on(Events.MessageCreate, async (message) => {
  try {
    console.log(message.content);
    console.log(process.env.GUILD_ID);
    console.log(message.guildId);

    if (message.guildId !== process.env.GUILD_ID)
      return console.log("no guild");

    if (message.author.id === message.client.user.id) return;
    if (message.channel.id !== FREE_CHANNEL_ID)
      return console.log("no free session");

    if (
      message.member.roles.cache.some((r) =>
        WHITE_LISTED_ROLE_IDS.includes(r.id),
      )
    )
      return;

    if (LINK_REGEX.test(message.content)) {
      await message.delete().catch(() => {});

      await message.channel.send(
        `${message.author}, posting links is not allowed here!`,
      );

      return;
    }

    // if (BAN_REGEX.test(message.content)) {
    //   await message.delete().catch(() => {});
    //   await message.member.ban({ reason: "Banned keyword detected" });

    //   return;
    // }

    if (CTA_KEYWORDS.test(message.content)) {
      await message.channel.send(
        `🚀 Join the free live session → <#${process.env.FREE_SESSION_CHANNEL_ID}>`,
      );
    }

    const now = Date.now();
    const userId = message.author.id;

    // Initialize cache for user
    if (!MESSAGE_CACHE.has(userId)) MESSAGE_CACHE.set(userId, []);

    const userMessages = MESSAGE_CACHE.get(userId);

    console.log(userMessages);

    // Add current message to cache
    userMessages.push({ content: message.content, timestamp: now });

    // Remove old messages outside time window
    const recentMessages = userMessages.filter(
      (m) => now - m.timestamp <= TIME_WINDOW,
    );
    MESSAGE_CACHE.set(userId, recentMessages);

    // Spam checks
    const largeMessage = message.content.length >= 300;
    const repeatedMessage =
      recentMessages.filter((m) => m.content === message.content).length >= 2;
    const rapidFlood = recentMessages.length >= MAX_MESSAGES;

    if (largeMessage || repeatedMessage || rapidFlood) {
      MESSAGE_CACHE.set(userId, []);

      await message.delete().catch(console.error);

      // Mute member (add a muted role or use timeout API)
      if (message.member.moderatable) {
        await message.member.timeout(MUTE_DURATION, "Spam / Flooding detected");
      }

      await message.author
        .send(
          "⚠️ You’ve been temporarily muted for 15 minutes due to spam or flooding.",
        )
        .catch(() => {});
    }
  } catch (err) {
    console.error(err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // =========== VERIFY BUTTON ===========
    if (interaction.isButton() && interaction.customId === "verify_button") {
      const modal = new ModalBuilder()
        .setCustomId("verify_form")
        .setTitle("Verification Form");

      const nameInput = new TextInputBuilder()
        .setCustomId("name")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter your full name")
        .setRequired(true);

      const nameLabel = new LabelBuilder()
        .setLabel("Full Name")
        .setTextInputComponent(nameInput);

      const emailInput = new TextInputBuilder()
        .setCustomId("email")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("example@email.com")
        .setRequired(true);

      const emailLabel = new LabelBuilder()
        .setLabel("Email Address")
        .setTextInputComponent(emailInput);

      const phoneInput = new TextInputBuilder()
        .setCustomId("phone")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("+1 234 567 890")
        .setRequired(true);

      const phoneLabel = new LabelBuilder()
        .setLabel("Phone Number")
        .setTextInputComponent(phoneInput);

      const countryInput = new TextInputBuilder()
        .setCustomId("country")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Your country")
        .setRequired(true);

      const countryLabel = new LabelBuilder()
        .setLabel("Country")
        .setTextInputComponent(countryInput);

      const ecomSelect = new StringSelectMenuBuilder()
        .setCustomId("ecom")
        .setPlaceholder("Make a selection!")
        .setRequired(true)
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("$0-$500")
            .setValue("$0-$500"),
          new StringSelectMenuOptionBuilder()
            .setLabel("$500-$2500")
            .setValue("$500-$2500"),
          new StringSelectMenuOptionBuilder()
            .setLabel("$2500-$5000")
            .setValue("$2500-$5000"),
          new StringSelectMenuOptionBuilder()
            .setLabel("$5000-$10000+")
            .setValue("$5000-$10000+"),
        );

      const ecomLabel = new LabelBuilder()
        .setLabel("If your Ecom success was guaranteed")
        .setDescription("how much would you be willing to invest in yourself?")
        .setStringSelectMenuComponent(ecomSelect);

      modal.addLabelComponents(
        nameLabel,
        emailLabel,
        phoneLabel,
        countryLabel,
        ecomLabel,
      );

      await interaction.showModal(modal);
    }

    // =========== MODAL SUBMISSION ===========
    if (interaction.isModalSubmit() && interaction.customId === "verify_form") {
      const name = interaction.fields.getTextInputValue("name");
      const email = interaction.fields.getTextInputValue("email");
      const phone = interaction.fields.getTextInputValue("phone");
      const country = interaction.fields.getTextInputValue("country");
      const ecom = interaction.fields.getStringSelectValues("ecom");

      await interaction.deferReply({ ephemeral: true });

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return await interaction.editReply({
          content:
            "❌ Invalid email address. Please try again using a valid email format.",
        });
      }

      const response = await openaiClient.responses.create({
        model: "gpt-4.1-nano",
        instructions:
          "I am gonna send you a word related to a country. It could be a typo, a city, a country code or anything. You tell the correct country (api compatible) name so i could use in close crm lead api. Just mention name",
        input: `${country}`,
      });

      console.log(response.output_text);

      // Submit to FormSpark
      let submitted = false;
      try {
        const res = await axios.post(process.env.FORMSPARK_URL, {
          name,
          email,
          phone,
          country: response.output_text,
          ecom,
          discord_user: `${interaction.user.tag} (${interaction.user.id})`,
          timestamp: new Date().toISOString(),
        });

        if (res.status === 200 || res.status === 201) {
          submitted = true;
          console.log(`✅ Form submitted for ${interaction.user.tag}`);
        } else {
          console.warn(`⚠️ FormSpark returned status ${res.status}`);
        }
      } catch (formErr) {
        console.error(formErr);
      }

      // Assign role ONLY if form submission succeeded
      if (submitted) {
        const guild = interaction.guild;
        const member = await guild.members.fetch(interaction.user.id);
        const role = guild.roles.cache.get(process.env.VERIFY_ROLE_ID);

        await member.roles.add(role);
        await member.roles.remove(process.env.UNVERIFIED_ROLE_ID);
        console.log(
          `✅ Role '${role.name}' assigned to ${interaction.user.tag}`,
        );

        await interaction.editReply({
          content: `✅ Success! Don’t miss the <#${process.env.FREE_SESSION_CHANNEL_ID}>`,
          ephemeral: true,
        });
      } else {
        await interaction.editReply({
          content:
            "⚠️ Could not submit your form. Please try again later — no role has been assigned.",
          ephemeral: true,
        });
      }
    }
  } catch (err) {
    console.error(err);
  }
});

client.login(process.env.TOKEN);
