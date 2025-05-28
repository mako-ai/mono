db.switzerland_close_opportunities.aggregate([
  // 0) union with all other country opportunity collections
  {
    $unionWith: {
      coll: "italy_close_opportunities",
    },
  },
  {
    $unionWith: {
      coll: "france_close_opportunities",
    },
  },
  {
    $unionWith: {
      coll: "spain_close_opportunities",
    },
  },

  {
    $match: {
      status_type: "won", // Filter for won opportunities
      date_won: { $exists: true, $ne: null }, // Ensure date_won exists and is not null
    },
  },

  // 1) count per country + month (yyyy-mm format)
  {
    $group: {
      _id: {
        country: {
          $ifNull: ["$_tenant_name", "Unknown Country"],
        },
        month: {
          $substr: ["$date_won", 0, 7], // Extract yyyy-mm from date_won
        },
      },
      count: { $sum: 1 },
    },
  },

  // 2) regroup by country: build an array of {k,v} pairs + total
  {
    $group: {
      _id: "$_id.country",
      months: {
        $push: {
          k: { $toString: "$_id.month" },
          v: "$count",
        },
      },
      total: { $sum: "$count" },
    },
  },

  // 2.5) sort months alphabetically within each country
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

  // 3) merge country, each month field, and total all into the root
  {
    $replaceRoot: {
      newRoot: {
        $mergeObjects: [
          { country: "$_id" },
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
