import { PrismaClient } from "@prisma/client";

export const applyMiddleware = (prisma: PrismaClient) => {
  /*

  NOTE: this middleware requires that all tables, including join tables, have both updatedAt and deletedAt columns.
  We enforce this using a DangerJS rule.

  The following three $use() blocks correspond to three events in the query lifecycle that we are intercepting:
  1) updates
  2) deletions
  3) lookups

  Whenever we update a record, we intercept that and set an updatedAt value on the row.
  Whenever we delete a record, we have to change the action to an update, and set a deletedAt. This is our soft-delete.
  Then, when we retrieve a record, we have to always add a filter to make sure that deletedAt is null.

  The third of those complicates things for any records that have a composite key. For any other kind of lookup,
  the shape of a findUnique argument is the same as the shape of a findFirst. E.g.
    { id: "uuid" }
  
  But if you are dealing with a composite key, the argument is shaped as follows:
  { 
    key1_key2: {
      key1: "uuid",
      key2: "uuid"
    }
  }

  So because we are coercing a findUnique to a findFirst, we have to flatten that object into the following shape:
  { 
    key1: "uuid",
    key2: "uuid"
  }

  */
  prisma.$use(async (params, next) => {
    if (params.action == "findUnique") {
      params.action = "findFirst";
      const where = params.args.where;
      // Clear out the filters and reapply them so we can change the shape of a composite key (WhereUniqueInput)
      // to fit the shape of what findFirst would expect (WhereInput)
      // We do that by taking anything that isn't an Object and just putting it right back in,
      // but if we encounter an object we have to iterate through its members to pull them out one level.
      params.args.where = {};
      for (const arg of Object.entries(where)) {
        if (typeof arg[1] !== "object") {
          params.args.where[arg[0]] = arg[1];
        } else {
          for (const subarg of Object.entries(
            arg[1] as Record<string, unknown>
          )) {
            params.args.where[subarg[0]] = subarg[1];
          }
        }
      }
      params.args.where["deletedAt"] = null;
    }
    if (params.action == "findMany") {
      if (!params.args) {
        params.args = {};
      }
      if (params.args?.where != undefined) {
        if (params.args.where.deletedAt == undefined) {
          params.args.where["deletedAt"] = null;
        }
      } else {
        params.args["where"] = { deletedAt: null };
      }
    }
    return next(params);
  });
  prisma.$use(async (params, next) => {
    if (params.action == "updateMany" || params.action == "update") {
      if (!params.args) {
        params.args = {};
      }
      if (!params.args.data) {
        params.args.data = {};
      }
      params.args.data["updatedAt"] = new Date();
    }
    return next(params);
  });
  prisma.$use(async (params, next) => {
    if (params.action == "delete") {
      params.action = "update";
      params.args["data"] = { deletedAt: new Date() };
    }
    if (params.action == "deleteMany") {
      if (!params.args) {
        params.args = {};
      }
      params.action = "updateMany";
      if (params.args?.data != undefined) {
        params.args.data["deletedAt"] = new Date();
      } else {
        params.args["data"] = { deletedAt: new Date() };
      }
    }
    return next(params);
  });
};
