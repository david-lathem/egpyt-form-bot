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
} = require("discord.js");
const axios = require("axios");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

client.once("ready", () => {
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
        .setLabel("Full Name")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter your full name")
        .setRequired(true);

      const emailInput = new TextInputBuilder()
        .setCustomId("email")
        .setLabel("Email Address")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("example@email.com")
        .setRequired(true);

      const phoneInput = new TextInputBuilder()
        .setCustomId("phone")
        .setLabel("Phone Number")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("+1 234 567 890")
        .setRequired(true);

      const countryInput = new TextInputBuilder()
        .setCustomId("country")
        .setLabel("Country")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Your country")
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(emailInput),
        new ActionRowBuilder().addComponents(phoneInput),
        new ActionRowBuilder().addComponents(countryInput)
      );

      await interaction.showModal(modal);
    }

    // =========== MODAL SUBMISSION ===========
    if (interaction.isModalSubmit() && interaction.customId === "verify_form") {
      const name = interaction.fields.getTextInputValue("name");
      const email = interaction.fields.getTextInputValue("email");
      const phone = interaction.fields.getTextInputValue("phone");
      const country = interaction.fields.getTextInputValue("country");

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return await interaction.reply({
          content:
            "❌ Invalid email address. Please try again using a valid email format.",
          ephemeral: true,
        });
      }

      // Submit to FormSpark
      let submitted = false;
      try {
        const res = await axios.post(process.env.FORMSPARK_URL, {
          name,
          email,
          phone,
          country,
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

        await interaction.reply({
          content:
            "✅ Your verification form has been submitted successfully and your role has been assigned!",
          ephemeral: true,
        });
      } else {
        await interaction.reply({
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
