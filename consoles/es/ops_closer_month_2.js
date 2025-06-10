// Database: atlas.revops

db.ch_close_opportunities.aggregate([
  // Only won deals in 2025, with a date, and a closer (add swiss-specific filter if needed)
  {
    $match: {
      status_type: "won",
      date_won: { $gte: "2025-01", $lt: "2026-01" },
      user_name: { $ne: null }, // , country: "Switzerland"
    },
  },
  { $addFields: { won_month: { $substr: ["$date_won", 0, 7] } } },

  // count per closer per month
  {
    $group: {
      _id: { closer: "$user_name", month: "$won_month" },
      count: { $sum: 1 },
    },
  },

  // combine all months as {month: count} objects per closer
  {
    $group: {
      _id: "$_id.closer",
      months: { $push: { k: "$_id.month", v: "$count" } },
    },
  },
  { $addFields: { monthFields: { $arrayToObject: "$months" } } },

  // move months to top-level with "closer"
  {
    $replaceRoot: {
      newRoot: { $mergeObjects: [{ closer: "$_id" }, "$monthFields"] },
    },
  },
]);
