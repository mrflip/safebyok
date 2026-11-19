---
"safebyok-graphql": patch
---

safebyok-graphql's bankResolvers end a watch's subscription with a last notice carrying the refusal when the bankDB's watch ends on bad news, where the subscription used to go quiet. GraphQLBankDB refuses a GraphQL error from the server with a message that says so, still `unexpected_error` and with no cause; an answer missing the field it asked for keeps the old message. A refusal's capacity is checked as it is sent, so a malformed one fails the request rather than crossing as null.
