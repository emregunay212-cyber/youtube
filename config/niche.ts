export const NICHE = {
  name: "Bilim & Teknoloji",
  language: "tr",

  keywords: [
    "yapay zeka", "AI", "ChatGPT", "Claude", "GPT", "LLM",
    "uzay", "NASA", "SpaceX", "Mars", "JWST", "uydu",
    "kuantum", "kuantum bilgisayar",
    "robot", "robotik", "humanoid",
    "biyoteknoloji", "CRISPR", "genetik",
    "noroloji", "beyin", "BCI",
    "siber guvenlik", "hack",
    "blockchain", "kripto",
    "iklim", "yenilenebilir enerji", "fuzyon",
    "donanim", "chip", "GPU", "Nvidia", "Apple silicon",
    "yazilim", "open source", "framework",
  ],

  excludeKeywords: [
    "kumar", "bahis",
    "kripto pump", "shitcoin", "memecoin",
    "celebrity gossip", "magazin",
  ],

  channelRules: {
    targetAudience: "23-45 yas, Turkiye, teknolojiye ilgili, universite mezunu",
    tone: "Akici, samimi, biraz heyecanli ama clickbait degil. Bilim kanal sunucusu havasi. CUMLELER SIIRSEL VE SINEMATIK olmali: kuru bilgi yerine sahne kuran, hareket iceren, duyularla dolu anlatim. 'Kahve eldeydi' yerine 'elinde sogumus kahvesiyle kapkaranlik ekranin karsisinda kalakaldi' gibi imgeli, betimleyici cumleler. Kisa ve uzun cumleleri karistirip ritim olustur. Edebi ama anlasilir.",
    forbiddenPhrases: [
      "SOK", "BILIM ADAMLARI SASKIN", "INANILMAZ KESIF",
      "kesin boyle", "bilim hala anlamadi",
    ],
    requiredCloser: "Eger bu video hosuna gittiyse abone olmayi ve yorum yazmayi unutma. Gorusmek uzere.",
  },

  youtube: {
    categoryId: 28,
    defaultTags: [
      "bilim", "teknoloji", "yapay zeka", "AI", "turkce",
      "bilim videolari", "teknoloji videolari", "aciklama",
    ],
    titlePrefix: "",
    descriptionFooter: [
      "",
      "Daha fazla bilim & teknoloji icerigi icin abone ol.",
      "",
      "#bilim #teknoloji #yapayzeka",
    ].join("\n"),
  },
} as const;

export type NicheConfig = typeof NICHE;
