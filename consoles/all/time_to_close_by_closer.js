// DB: atlas.revops
// By country & closer; won after country/closer, 2 decimals, all metrics

const collections = [
  "es_close_opportunities",
  "it_close_opportunities",
  "fr_close_opportunities",
];
const unionStages = collections.map(col => ({
  $unionWith: { coll: col },
}));

db.ch_close_opportunities.aggregate([
  ...unionStages,
  {
    $addFields: {
      country: {
        $switch: {
          branches: [
            { case: { $eq: ["$_dataSourceId", "ch_close"] }, then: "CH" },
            { case: { $eq: ["$_dataSourceId", "es_close"] }, then: "ES" },
            { case: { $eq: ["$_dataSourceId", "it_close"] }, then: "IT" },
            { case: { $eq: ["$_dataSourceId", "fr_close"] }, then: "FR" },
          ],
          default: "?",
        },
      },
      closer: "$user_name",
    },
  },
  {
    $facet: {
      wonStats: [
        {
          $match: {
            status_type: "won",
            date_won: { $ne: null },
            date_created: { $ne: null },
          },
        },
        {
          $addFields: {
            d2c: {
              $divide: [
                {
                  $subtract: [
                    { $toDate: "$date_won" },
                    { $toDate: "$date_created" },
                  ],
                },
                1000 * 60 * 60 * 24,
              ],
            },
          },
        },
        { $match: { d2c: { $gte: 0 } } },
        {
          $group: {
            _id: { country: "$country", closer: "$closer" },
            avg: { $avg: "$d2c" },
            dlist: { $push: "$d2c" },
            won: { $sum: 1 },
          },
        },
        {
          $addFields: {
            sorted: { $sortArray: { input: "$dlist", sortBy: 1 } },
            count: { $size: "$dlist" },
          },
        },
        {
          $addFields: {
            med: {
              $cond: [
                { $eq: [{ $mod: ["$count", 2] }, 1] },
                {
                  $arrayElemAt: [
                    "$sorted",
                    { $floor: { $divide: ["$count", 2] } },
                  ],
                },
                {
                  $avg: [
                    {
                      $arrayElemAt: [
                        "$sorted",
                        { $subtract: [{ $divide: ["$count", 2] }, 1] },
                      ],
                    },
                    { $arrayElemAt: ["$sorted", { $divide: ["$count", 2] }] },
                  ],
                },
              ],
            },
          },
        },
        {
          $project: {
            _id: 0,
            country: "$_id.country",
            closer: "$_id.closer",
            won: 1,
            avg: { $round: ["$avg", 2] },
            med: { $round: ["$med", 2] },
          },
        },
      ],
      conv: [
        {
          $match: {
            $or: [
              {
                status_type: "won",
                date_won: { $ne: null },
                date_created: { $ne: null },
              },
              { status_type: "lost" },
            ],
          },
        },
        {
          $addFields: {
            d2c: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status_type", "won"] },
                    { $ne: ["$date_won", null] },
                    { $ne: ["$date_created", null] },
                  ],
                },
                {
                  $divide: [
                    {
                      $subtract: [
                        { $toDate: "$date_won" },
                        { $toDate: "$date_created" },
                      ],
                    },
                    1000 * 60 * 60 * 24,
                  ],
                },
                null,
              ],
            },
          },
        },
        {
          $group: {
            _id: { country: "$country", closer: "$closer" },
            won: { $sum: { $cond: [{ $eq: ["$status_type", "won"] }, 1, 0] } },
            lost: {
              $sum: { $cond: [{ $eq: ["$status_type", "lost"] }, 1, 0] },
            },
            w_7: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$status_type", "won"] },
                      { $lte: ["$d2c", 7] },
                      { $gte: ["$d2c", 0] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            w_14: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$status_type", "won"] },
                      { $lte: ["$d2c", 14] },
                      { $gte: ["$d2c", 0] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            w_30: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$status_type", "won"] },
                      { $lte: ["$d2c", 30] },
                      { $gte: ["$d2c", 0] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            country: "$_id.country",
            closer: "$_id.closer",
            cr: {
              $cond: [
                { $gt: [{ $add: ["$won", "$lost"] }, 0] },
                {
                  $round: [
                    { $divide: ["$won", { $add: ["$won", "$lost"] }] },
                    2,
                  ],
                },
                null,
              ],
            },
            cr_7: {
              $cond: [
                { $gt: [{ $add: ["$won", "$lost"] }, 0] },
                {
                  $round: [
                    { $divide: ["$w_7", { $add: ["$won", "$lost"] }] },
                    2,
                  ],
                },
                null,
              ],
            },
            cr_14: {
              $cond: [
                { $gt: [{ $add: ["$won", "$lost"] }, 0] },
                {
                  $round: [
                    { $divide: ["$w_14", { $add: ["$won", "$lost"] }] },
                    2,
                  ],
                },
                null,
              ],
            },
            cr_30: {
              $cond: [
                { $gt: [{ $add: ["$won", "$lost"] }, 0] },
                {
                  $round: [
                    { $divide: ["$w_30", { $add: ["$won", "$lost"] }] },
                    2,
                  ],
                },
                null,
              ],
            },
          },
        },
      ],
    },
  },
  {
    $project: {
      merged: {
        $map: {
          input: "$wonStats",
          as: "row",
          in: {
            $mergeObjects: [
              "$$row",
              {
                cr: {
                  $let: {
                    vars: {
                      c: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: "$conv",
                              as: "c",
                              cond: {
                                $and: [
                                  { $eq: ["$$c.country", "$$row.country"] },
                                  { $eq: ["$$c.closer", "$$row.closer"] },
                                ],
                              },
                            },
                          },
                          0,
                        ],
                      },
                    },
                    in: "$$c.cr",
                  },
                },
                cr_7: {
                  $let: {
                    vars: {
                      c: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: "$conv",
                              as: "c",
                              cond: {
                                $and: [
                                  { $eq: ["$$c.country", "$$row.country"] },
                                  { $eq: ["$$c.closer", "$$row.closer"] },
                                ],
                              },
                            },
                          },
                          0,
                        ],
                      },
                    },
                    in: "$$c.cr_7",
                  },
                },
                cr_14: {
                  $let: {
                    vars: {
                      c: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: "$conv",
                              as: "c",
                              cond: {
                                $and: [
                                  { $eq: ["$$c.country", "$$row.country"] },
                                  { $eq: ["$$c.closer", "$$row.closer"] },
                                ],
                              },
                            },
                          },
                          0,
                        ],
                      },
                    },
                    in: "$$c.cr_14",
                  },
                },
                cr_30: {
                  $let: {
                    vars: {
                      c: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: "$conv",
                              as: "c",
                              cond: {
                                $and: [
                                  { $eq: ["$$c.country", "$$row.country"] },
                                  { $eq: ["$$c.closer", "$$row.closer"] },
                                ],
                              },
                            },
                          },
                          0,
                        ],
                      },
                    },
                    in: "$$c.cr_30",
                  },
                },
              },
            ],
          },
        },
      },
    },
  },
  { $unwind: "$merged" },
  {
    $replaceRoot: {
      newRoot: {
        country: "$merged.country",
        closer: "$merged.closer",
        won: "$merged.won",
        avg: { $toString: { $round: [{ $toDouble: "$merged.avg" }, 2] } },
        med: { $toString: { $round: [{ $toDouble: "$merged.med" }, 2] } },
        cr: { $toString: { $round: [{ $toDouble: "$merged.cr" }, 2] } },
        cr_7: { $toString: { $round: [{ $toDouble: "$merged.cr_7" }, 2] } },
        cr_14: { $toString: { $round: [{ $toDouble: "$merged.cr_14" }, 2] } },
        cr_30: { $toString: { $round: [{ $toDouble: "$merged.cr_30" }, 2] } },
      },
    },
  },
]);
