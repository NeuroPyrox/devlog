"use strict";

// TODO single source of truth

// HARDCODED
const getNewPosts = () => [
  {
    date: "15 June 2020",
    title: "Post Locations",
    href: `/post-locations`
  },
  {
    date: "14 June 2020",
    title: "Didn't Solve AGI",
    href: `/didnt-solve-agi`
  }
];

// HARDCODED
const oldBlog = [
  {
    date: "17 March 2020",
    title: "What must a good PL have?",
    href:
      "https://docs.google.com/document/d/1hMYGSGB2hbcUQ7nHWxGKHQl8dmZ_02oIidHAO-vTjUg/edit?usp=sharing"
  },
  {
    date: "12 March 2020",
    title: "500 lines of code per day - A Manifesto",
    href:
      "https://docs.google.com/document/d/1fY1Qb6-3uDXpn5w9f2YK3O-52xK25HN0XuU4kdB6TSo/edit?usp=sharing"
  },
  {
    date: "12 March 2020",
    title: "The Best Motivational Songs EVER",
    href:
      "https://docs.google.com/document/d/10o9TxDF_HAid-GMlOvuL0Lq0FKif6es6H7YIqdJ6two/edit?usp=sharing"
  },
  {
    date: "12 March 2020",
    title: "Some AI ideas",
    href:
      "https://docs.google.com/document/d/1_2_eOD9mR8j5CWFoXLzawQonGcR3dn5yUuyQXCzRQ_Y/edit?usp=sharing"
  },
  {
    date: "12 March 2020",
    title: "First post - Why I'm making this blog",
    href:
      "https://drive.google.com/open?id=15RJuP-t50Q3s3cZ_tl6Kl0DdHv2wN1nPL5dSc23DWH0"
  }
];

module.exports = async () => {
  const mayPosts = (await require("../2020/5/getPostLocations.js")()).map(
    ({ day, title, href }) => ({
      date: `${day} May 2020`,
      title,
      href
    })
  );
  const posts = getNewPosts()
    .concat(mayPosts)
    .concat(oldBlog);
  return posts;
};
