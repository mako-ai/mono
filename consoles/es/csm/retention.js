// Database: atlas.revops   –  Collection: es_close_leads

db.es_close_leads.aggregate([
  /* 1. Pick the “won” cohort (Client Won Date between 1 May 2023 and 31 May 2024) */
  {
    $addFields: {
      clientWonDateStr: {
        $ifNull: [
          '$custom.Client Won Date', // human-readable key
          '$custom.cf_MgNrD6QjS7oPnxV5BdneTG06g17tVoAjgUd6ICf808u', // same field by internal id
        ],
      },
      csmId: {
        $ifNull: [
          '$custom.CSM Owner',
          '$custom.cf_noF6qnZhFDHUYQQBzokx957zkdceLfFZtqCZ1RTsIvJ', // internal id
        ],
      },
    },
  },
  {
    $addFields: {
      clientWonDate: {
        $cond: [
          {
            $and: [
              { $ne: ['$clientWonDateStr', null] },
              { $ne: ['$clientWonDateStr', ''] },
            ],
          },
          {
            $dateFromString: {
              dateString: '$clientWonDateStr',
              format: '%Y-%m-%d',
            },
          },
          null,
        ],
      },
    },
  },
  {
    $match: {
      clientWonDate: {
        $gte: new Date('2023-05-01T00:00:00Z'),
        $lte: new Date('2024-05-31T23:59:59Z'),
      },
    },
  },

  /* 2. Compute retention per CSM (today’s status == “Customer” ⇢ retained) */
  {
    $group: {
      _id: '$csmId',
      totalCustomers: { $sum: 1 },
      retainedCustomers: {
        $sum: { $cond: [{ $eq: ['$status_label', 'Customer'] }, 1, 0] },
      },
    },
  },
  {
    $addFields: {
      retentionRate: {
        $cond: [
          { $gt: ['$totalCustomers', 0] },
          { $divide: ['$retainedCustomers', '$totalCustomers'] },
          0,
        ],
      },
    },
  },

  /* 3. Pull CSM full name from the users collection */
  {
    $lookup: {
      from: 'es_close_users',
      localField: '_id',
      foreignField: 'id',
      as: 'user',
    },
  },
  {
    $addFields: {
      csmName: {
        $arrayElemAt: [
          {
            $map: {
              input: '$user',
              as: 'u',
              in: { $concat: ['$$u.first_name', ' ', '$$u.last_name'] },
            },
          },
          0,
        ],
      },
    },
  },

  /* 4. Present a clean, sortable result set */
  {
    $project: {
      _id: 0,
      csmId: 1,
      csmName: 1,
      totalCustomers: 1,
      retainedCustomers: 1,
      retentionRate: { $round: [{ $multiply: ['$retentionRate', 100] }, 2] }, // %
    },
  },
  { $sort: { retentionRate: -1, totalCustomers: -1 } },
]);
