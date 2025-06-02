db.switzerland_close_opportunities.aggregate([
  {
    $match: {
      status_type: "won", // Filter for active opportunities
      date_won: { $exists: true, $ne: null }, // Ensure date_won exists and is not null
    },
  },

  // 1) count per closer + month (yyyy-mm format)
  {
    $group: {
      _id: {
        closer: {
          $ifNull: ["$user_name", "Unknown Closer"],
        },
        month: {
          $substr: ["$date_won", 0, 7], // Extract yyyy-mm from date_won
        },
      },
      count: { $sum: 1 },
    },
  },

  // 2) regroup by closer: build an array of {k,v} pairs + total
  {
    $group: {
      _id: "$_id.closer",
      months: {
        $push: {
          k: { $toString: "$_id.month" },
          v: "$count",
        },
      },
      total: { $sum: "$count" },
    },
  },

  // 3) merge closer, each month field, and total all into the root
  {
    $replaceRoot: {
      newRoot: {
        $mergeObjects: [
          { closer: "$_id" },
          { $arrayToObject: "$months" },
          { "total (all months)": "$total" },
        ],
      },
    },
  },

  // 4) final sort by total descending
  {
    $sort: { "total (all months)": -1 },
  },
]);

// --- Won opportunities count by closer & quarter (pivoted) ---
db.switzerland_close_opportunities.aggregate([
  /* 0) keep only “won” opportunities that have a date_won */
  {
    $match: {
      status_type: "won",
      date_won: { $exists: true, $ne: null },
    },
  },

  /* 1) compute helper fields: closer, year, month number, quarter label */
  {
    $addFields: {
      closer: { $ifNull: ["$user_name", "Unknown Closer"] },
      year: { $substr: ["$date_won", 0, 4] },
      monthNumber: { $toInt: { $substr: ["$date_won", 5, 2] } },
    },
  },
  {
    $addFields: {
      quarter: {
        $concat: [
          "$year",
          "-Q",
          {
            $toString: {
              $ceil: { $divide: ["$monthNumber", 3] }, // 1-4
            },
          },
        ],
      },
    },
  },

  /* 2) count opportunities per closer + quarter */
  {
    $group: {
      _id: { closer: "$closer", quarter: "$quarter" },
      count: { $sum: 1 },
    },
  },

  /* 3) pivot: one document per closer, quarters become dynamic fields */
  {
    $group: {
      _id: "$_id.closer",
      quarters: {
        $push: {
          k: "$_id.quarter",
          v: "$count",
        },
      },
      total: { $sum: "$count" },
    },
  },

  /* 4) merge into flat row: { closer, <YYYY-Qn>: <cnt>, total (all quarters) } */
  {
    $replaceRoot: {
      newRoot: {
        $mergeObjects: [
          { closer: "$_id" },
          { $arrayToObject: "$quarters" },
          { "total (all quarters)": "$total" },
        ],
      },
    },
  },

  /* 5) sort by the grand total, highest first */
  { $sort: { "total (all quarters)": -1 } },
]);
