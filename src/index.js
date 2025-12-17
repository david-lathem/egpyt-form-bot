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
        "To get verified, please fill out the form including your **Name**, **Email**, **Phone Number**, and **Country**.\n\nClick the **Verify** button below to begin."
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
            .setValue("$5000-$10000+")
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
        ecomLabel
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
        console.log(
          `✅ Role '${role.name}' assigned to ${interaction.user.tag}`
        );

        await interaction.editReply({
          content:
            "✅ Your verification form has been submitted successfully and your role has been assigned!",
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
