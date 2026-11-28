// The platform rules: one article for advertisers and one for developers, read as guides on Home. Plain data.
// The titles of the advertiser's rules are what an admin picks from when a report ends with a request to change a
// creative or with a block, and what the advertiser then reads, so a decision always points at a rule that is written here.

export const RULEBOOK = {
  adv: {
    title: "Platform rules for advertisers",
    card: "What an ad must and must not be, and what happens when a rule is broken.",
    min: 4,
    intro: "Your ads appear inside other people’s games. These rules keep them welcome there. Every creative is checked against them before it runs, and again when a game reports it.",
    rules: [
      ["Ads must be truthful", "An ad does not promise what the product or offer does not keep. Prices, discounts, “free” and deadlines on the picture are real on the days it runs."],
      ["The ad belongs to the category it was booked in", "Pick the category that describes what is advertised. Alcohol and tobacco, gambling, and dating and adult are restricted: they show only in games whose developers allow them. Booking them under another category is a violation."],
      ["No offensive or harmful content", "No hate or discrimination, harassment, sexual content, graphic violence or shock pictures."],
      ["Nothing illegal or dangerous", "No illegal goods or services, drugs, weapons or scams, and nothing unlawful in the countries the campaign is aimed at."],
      ["Suitable for the players who see it", "Players of any age can be in a game. An ad does not push to children what is not meant for them."],
      ["Links and codes must be safe", "A web address or QR code on the picture leads where the picture says. Never to malware, phishing or a download the player did not ask for."],
      ["Only what you have the rights to", "Use your own brand and artwork, and people who agreed to be shown. Do not use someone else’s trademark, character or photo, and do not pose as another company."],
      ["An ad looks like an ad", "It is not disguised as a part of the game, a system message or a DeusADS notice. No fake buttons or warnings, no flashing or strobing pictures."],
      ["Readable in a game", "Text is large enough to read from a distance, the picture is sharp, and what matters stays inside the safe zone."],
    ],
    note: ["What happens when a rule is broken.", "If it is easy to fix, we ask for a new version: the creative stops showing until the new one is approved. A clear violation is blocked for good. Either way you see which rule it is and a message from DeusADS, the campaign keeps running with its other creatives, and nothing is charged for what is not shown. Repeated violations can lead to the account being closed."],
  },
  dev: {
    title: "Platform rules for developers",
    card: "Fair impressions, visible placements, and how blocking and reporting work.",
    min: 4,
    intro: "Advertisers pay for what your players really see. These rules keep the numbers honest and your game a place brands want to be in.",
    rules: [
      ["Impressions come from real players", "No bots, scripts or device farms, no rewards for looking at ads, and no running your own game to raise the numbers."],
      ["Placements are where players can see them", "A placement sits in the playable part of a scene and faces the player. It is not hidden behind objects, shrunk to a dot or stacked on other placements."],
      ["The ad is shown as it is", "Do not cover, recolour, distort or draw over a creative. The shading the SDK applies by itself is fine."],
      ["The SDK is not tampered with", "Do not change how the SDK counts or reports views."],
      ["Game details are true", "Genres, platforms, languages, countries and the audience describe the real game. Advertisers choose games by them."],
      ["The game is lawful and safe for brands", "No hateful or illegal content in the game, and no placements on objects that mock or degrade the ad."],
      ["Block freely, report honestly", "Blocking is your choice for your game and needs nobody’s approval. A report asks DeusADS to check a creative against the rules for advertisers, for every game. Use it for a violation, not for an ad you simply do not like."],
    ],
    note: ["What happens when a rule is broken.", "Impressions that break these rules may be left uncounted and unpaid, and a placement can be paused until it is fixed. We write to you first whenever we can. Repeated violations can lead to the account being closed."],
  },
};

/** The rules an admin's decision on a creative can point at. */
export const ADVERTISER_RULES = RULEBOOK.adv.rules.map(([title]) => title);
export const isAdvertiserRule = (text) => ADVERTISER_RULES.includes(text);

/** The rule a report's reason most likely is about: what the decision form offers first. */
const RULE_OF_REASON = {
  "Misleading or deceptive": 0,
  "Wrong category": 1,
  "Inappropriate content": 2,
  "Suspicious link or malware": 5,
  "Not suitable for my audience": 4,
};
export const ruleForReason = (reason) => ADVERTISER_RULES[RULE_OF_REASON[reason] ?? 0];

/** The address of the rules of one side (the guide pages of Home). */
export const rulesLink = (role) => `/dashboard/home/guides/${role === "dev" ? "platform-rules-for-developers" : "platform-rules-for-advertisers"}`;
