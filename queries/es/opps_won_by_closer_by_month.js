db.spain_close_opportunities.aggregate([
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

  // 2.5) sort the months array alphabetically (yyyy-mm) before merging into object
  {
    $addFields: {
      months: {
        $sortArray: {
          input: "$months",
          sortBy: { k: 1 },
        },
      },
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
