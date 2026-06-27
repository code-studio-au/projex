export type CreateDatabaseExecArgsOptions = {
  user: string;
  password: string;
  database: string;
};

export declare function buildCreateDatabaseExecArgs(
  options: CreateDatabaseExecArgsOptions
): string[];
