db.switzerland_close_leads.aggregate([
  // 0) union with italy_close_leads to combine both collections
  {
    $unionWith: {
      coll: 'italy_close_leads',
    },
  },

  // 1) count per owner+status
  {
    $group: {
      _id: {
        owner: '$custom.Lead Owner',
        status: '$status_label',
      },
      count: { $sum: 1 },
    },
  },

  // 2) regroup by owner: build an array of {k,v} pairs + total
  {
    $group: {
      _id: '$_id.owner',
      statuses: {
        $push: { k: '$_id.status', v: '$count' },
      },
      total: { $sum: '$count' },
    },
  },

  // 3) merge owner, each status field, and total all into the root
  {
    $replaceRoot: {
      newRoot: {
        $mergeObjects: [
          { lead_owner: '$_id' },
          { $arrayToObject: '$statuses' },
          { 'total (all status)': '$total' },
        ],
      },
    },
  },

  // 4) final sort by total descending
  {
    $sort: { 'total (all status)': -1 },
  },
]);
