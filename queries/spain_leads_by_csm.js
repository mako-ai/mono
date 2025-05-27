db.spain_close_leads.aggregate([
  {
    $match: {
      "opportunities.date_won": {
        $regex: "^2024-06", // Matches dates starting with "YYYY-06", referring to June
      },
      status_label: {
        $regex: "Customer", // Ensure the status label contains "Customer"
      },
    },
  },

  // 1) count per CSM owner + renewal probability
  {
    $group: {
      _id: {
        owner: {
          $ifNull: ["$custom.CSM Owner", "Unknown CSM"],
        },
        renewalProbability: {
          $ifNull: ["$custom.Renewal Probability", "Unknown"],
        },
      },
      count: { $sum: 1 },
    },
  },

  // 2) regroup by CSM owner: build an array of {k,v} pairs + total
  {
    $group: {
      _id: "$_id.owner",
      renewalProbabilities: {
        $push: {
          k: { $toString: "$_id.renewalProbability" },
          v: "$count",
        },
      },
      total: { $sum: "$count" },
    },
  },

  // 3) merge CSM owner, each renewal probability field, and total all into the root
  {
    $replaceRoot: {
      newRoot: {
        $mergeObjects: [
          { csm_owner: "$_id" },
          { $arrayToObject: "$renewalProbabilities" },
          { "total (all renewal probabilities)": "$total" },
        ],
      },
    },
  },

  // 4) final sort by total descending
  {
    $sort: { "total (all renewal probabilities)": -1 },
  },
]);
