db.spain_close_opportunities.aggregate([
  {
    $match: {
      status_type: "won", // Filter for won opportunities
      date_won: { $exists: true, $ne: null }, // Ensure date_won exists and is not null
    },
  },

  // Group by month (yyyy-mm format) and calculate metrics
  {
    $group: {
      _id: {
        $substr: ["$date_won", 0, 7], // Extract yyyy-mm from date_won
      },
      opportunities_won: { $sum: 1 },
      monthly_value: {
        $sum: {
          $divide: [
            { $divide: [{ $ifNull: ["$annualized_value", 0] }, 12] },
            100,
          ],
        },
      },
    },
  },

  // Calculate average monthly value
  {
    $addFields: {
      average_monthly_value: {
        $cond: {
          if: { $gt: ["$opportunities_won", 0] },
          then: { $divide: ["$monthly_value", "$opportunities_won"] },
          else: 0,
        },
      },
    },
  },

  // Reshape the output to have cleaner field names
  {
    $project: {
      _id: 0,
      month: "$_id",
      opportunities_won: 1,
      monthly_value: { $round: ["$monthly_value", 0] },
      average_monthly_value: { $round: ["$average_monthly_value", 0] },
    },
  },

  // Sort by month chronologically
  {
    $sort: { month: 1 },
  },
]);
