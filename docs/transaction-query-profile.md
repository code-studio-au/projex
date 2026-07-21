# Transaction page query profile

Item 9 was profiled on 21 July 2026 with PostgreSQL 16 in the repository's
disposable Docker environment. The reproducible command is:

```sh
pnpm run profile:transaction-page
```

The harness migrates a fresh database, seeds projects containing 1,000, 10,000,
and 100,000 representative transactions, runs `ANALYZE`, and records the second
warm-cache `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` execution. Absolute timings
vary by host; the plan shape and relative comparison are the decision evidence.

| Phase                  | Project rows | Page query ms | Summary query ms |
| ---------------------- | -----------: | ------------: | ---------------: |
| Baseline               |        1,000 |         0.647 |            1.355 |
| Baseline               |       10,000 |         5.894 |           13.093 |
| Baseline               |      100,000 |        24.188 |          152.954 |
| Project/date/id index  |        1,000 |         0.039 |            1.330 |
| Project/date/id index  |       10,000 |         0.034 |           13.363 |
| Project/date/id index  |      100,000 |         0.031 |          152.473 |
| Index + joined summary |        1,000 |         0.034 |            0.834 |
| Index + joined summary |       10,000 |         0.028 |            5.896 |
| Index + joined summary |      100,000 |         0.031 |           57.368 |

The baseline page plan sorted all matching project transactions and became a
parallel sequential scan at 100,000 rows. The project/date/id index changed it
to a directly ordered index scan, reducing the page query by about 99.9% at that
size.

The index does not help the aggregate because the summary must inspect every
matching transaction. Replacing repeated correlated checks with unique
project-scoped joins for valid subcategories and open reversals reduced the
100,000-row summary by about 62.5%. The assigned-comment calculation remains a
single indexed existence check because multiple comments can exist per
transaction and a direct join would multiply aggregate rows.
