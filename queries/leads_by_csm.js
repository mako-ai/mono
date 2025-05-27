db.switzerland_close_leads.aggregate([
  {
    $match: {
      "opportunities.status_type": "won",
    },
  },
  {
    $group: {
      _id: "$custom.CSM Owner",
      count: { $sum: 1 },
    },
  },
  {
    $sort: { count: -1 },
  },
]);
