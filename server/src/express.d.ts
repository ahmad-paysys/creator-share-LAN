declare namespace Express {
  export interface Request {
    auth?: {
      sessionToken: string | null;
      user:
        | {
            id: string;
            username: string;
            displayName: string | null;
            role: "owner" | "admin" | "editor" | "viewer";
          }
        | null;
    };
  }
}
