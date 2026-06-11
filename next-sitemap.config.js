/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_BASE_URL || "https://sitemorethanmoney.vercel.app",
  generateRobotsTxt: true,
  sitemapSize: 7000,
  changefreq: "daily",
  priority: 0.7,
  exclude: ["/admin-*", "/api/*", "/test-*", "/checkout", "/payment/*"],
  additionalPaths: async (config) => [
    await config.transform(config, "/"),
    await config.transform(config, "/scanner"),
    await config.transform(config, "/copytrading"),
    await config.transform(config, "/automation"),
    await config.transform(config, "/jifu-education"),
    await config.transform(config, "/bootcamp"),
    await config.transform(config, "/member-area"),
    await config.transform(config, "/affiliate-dashboard"),
    await config.transform(config, "/portfolios"),
    await config.transform(config, "/privacidade"),
    await config.transform(config, "/terms"),
    await config.transform(config, "/faq"),
  ],
  robotsTxtOptions: {
    policies: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin-*", "/api/*", "/test-*"],
      },
    ],
  },
}
