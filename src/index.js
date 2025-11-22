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
const qs = require("qs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

let webinarInfo;

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const payload = {
    api_key: process.env.WEBINAR_API_KEY,
    webinar_id: process.env.WEBINAR_ID,
  };

  const res = await fetch(process.env.WEBINAR_API_BASE_URL + "/webinar", {
    method: "POST",
    body: qs.stringify(payload),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  webinarInfo = await res.json();
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

      const firstNameInput = new TextInputBuilder()
        .setCustomId("first_name")
        .setLabel("First Name")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter your First name")
        .setRequired(true);

      const lastNameInput = new TextInputBuilder()
        .setCustomId("last_name")
        .setLabel("Last Name")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter your Last name")
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

      // const countryInput = new TextInputBuilder()
      //   .setCustomId("country")
      //   .setLabel("Country")
      //   .setStyle(TextInputStyle.Short)
      //   .setPlaceholder("Your country")
      //   .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(firstNameInput),
        new ActionRowBuilder().addComponents(lastNameInput),
        new ActionRowBuilder().addComponents(emailInput),
        new ActionRowBuilder().addComponents(phoneInput)
        // new ActionRowBuilder().addComponents(countryInput)
      );

      await interaction.showModal(modal);
    }

    // =========== MODAL SUBMISSION ===========
    if (interaction.isModalSubmit() && interaction.customId === "verify_form") {
      const firstName = interaction.fields.getTextInputValue("first_name");
      const lastName = interaction.fields.getTextInputValue("last_name");
      const email = interaction.fields.getTextInputValue("email");
      const phone = interaction.fields.getTextInputValue("phone");
      // const country = interaction.fields.getTextInputValue("country");

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return await interaction.reply({
          content:
            "❌ Invalid email address. Please try again using a valid email format.",
          ephemeral: true,
        });
      }

      if (phone.length < 6)
        return await interaction.reply({
          content: "❌ Invalid Phone. Make sure its 6 chars at least.",
          ephemeral: true,
        });
      // Submit to FormSpark
      let submitted = false;
      let res;
      try {
        const payload = {
          api_key: process.env.WEBINAR_API_KEY,
          webinar_id: process.env.WEBINAR_ID,
          schedule: webinarInfo.webinar.schedules[0].schedule,
          first_name: firstName,
          last_name: `${lastName} (Discord: ${interaction.user.tag} - ${interaction.user.id})`,
          email,
          phone,
          // Optional fields:
          // country: country,
          // discord_user: `${interaction.user.tag} (${interaction.user.id})`,
          // timestamp: new Date().toISOString(),
        };

        // Encode as x-www-form-urlencoded
        const encodedPayload = qs.stringify(payload);

        res = await axios.post(
          `${process.env.WEBINAR_API_BASE_URL}/register`,
          encodedPayload,
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          }
        );

        if (res.status === 200) {
          submitted = true;
          console.log(`✅ Form submitted for ${interaction.user.tag}`);
        } else {
          console.warn(`⚠️ FormSpark returned status ${res.status}`);
        }
      } catch (formErr) {
        console.error(formErr);
        console.log(formErr.response?.data);
        console.log(formErr.response?.data?.errors);
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
          content: `✅ Your verification form has been submitted successfully and your role has been assigned!\nJoin the webinar through [Live URL](${res.user.live_room_url}). Here's the [Replay Room URL](${res.user.replay_room_url})`,
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
