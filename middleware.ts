import {PrismaClient} from '@prisma/client'

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
  const skipList: string[] = ['expand', 'organization', 'parentOrganization']
  
  prisma.$use((params, next) => {
    if (skipList.findIndex(val => val === params.model) !== -1) {
      return next(params)
    }

    if (params.action === 'findUnique') {
      params.action = 'findFirst'
      const where = params.args.where
      // Clear out the filters and reapply them so we can change the shape of a composite key (WhereUniqueInput)
      // to fit the shape of what findFirst would expect (WhereInput)
      // We do that by taking anything that isn't an Object and just putting it right back in,
      // but if we encounter an object we have to iterate through its members to pull them out one level.
      params.args.where = {}
      for (const arg of Object.entries(where)) {
        if (typeof arg[1] !== 'object') {
          params.args.where[arg[0]] = arg[1]
        } else {
          for (const subarg of Object.entries(arg[1] as Record<string, unknown>)) {
            params.args.where[subarg[0]] = subarg[1]
          }
        }
      }
      params.args.where['isDeleted'] = false
    }
    if (params.action === 'findMany') {
      if (!params.args) {
        params.args = {}
      }
      if (params.args?.where !== undefined) {
        if (params.args.where.isDeleted === undefined) {
          params.args.where['isDeleted'] = false
        }
      } else {
        params.args['where'] = {isDeleted: false}
      }
    }
    return next(params)
  })
  /**
   * use 'updatedAt DateTime @updatedAt' in schema.prisma
   */
  // db.$use(async (params, next) => {
  //   if (params.action == 'updateMany' || params.action == 'update') {
  //     if (!params.args) {
  //       params.args = {}
  //     }
  //     if (!params.args.data) {
  //       params.args.data = {}
  //     }
  //     params.args.data['updatedAt'] = new Date()
  //   }
  //   return next(params)
  // })
  prisma.$use(async (params, next) => {
    if (skipList.findIndex(val => val === params.model) !== -1) {
      return next(params)
    }
    if (params.action === 'delete') {
      params.action = 'update'
      params.args['data'] = {
        isDeleted: true,
        deletedAt: new Date(),
      }
    }
    if (params.action === 'deleteMany') {
      if (!params.args) {
        params.args = {}
      }
      params.action = 'updateMany'
      if (params.args?.data != undefined) {
        params.args.data['isDeleted'] = true
        params.args.data['deletedAt'] = new Date()
      } else {
        params.args['data'] = {
          isDeleted: true,
          deletedAt: new Date(),
        }
      }
    }
    return next(params)
  })

  // deal include
  prisma.$use(async (params, next) => {
    const {include} = params.args
    if (include) {
      for (const key in include) {
        if (Object.prototype.hasOwnProperty.call(include, key)) {
          if (skipList.findIndex(val => val === key) !== -1) {
            continue
          }
          const element = include[key]

          if (element) {
            // skip include modelName in skipList
            if (typeof element === 'boolean') {
              include[key] = {
                where: {
                  isDeleted: false,
                },
              }
            }
            if (typeof element === 'object') {
              if (!Object.prototype.hasOwnProperty.call(element, 'where')) {
                include[key] = {
                  ...element,
                  where: {
                    isDeleted: false,
                  },
                }
              } else {
                if (!Object.prototype.hasOwnProperty.call(element.where, 'isDeleted')) {
                  include[key] = {
                    ...element,
                    where: {
                      ...element.where,
                      isDeleted: false,
                    },
                  }
                }
              }
            }
          }
        }
      }
    }
    return next(params)
  })
}
