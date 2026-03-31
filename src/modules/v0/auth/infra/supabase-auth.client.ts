type SupabaseUserInput = {
  phone: string;
  password: string;
  firstName: string;
  lastName: string;
  gender?: string | null;
  dateOfBirth?: string | null;
};

type SupabaseUserResult = {
  userId: string;
  phone: string | null;
  phoneConfirmedAt: string | null;
  firstName: string | null;
  lastName: string | null;
  gender: string | null;
  dateOfBirth: string | null;
};

type SupabaseRequestError = {
  message?: string;
  error_description?: string;
  msg?: string;
  code?: string;
};

export class SupabaseAuthError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "SupabaseAuthError";
  }
}

export class SupabaseAuthClient {
  constructor(
    private readonly url: string,
    private readonly serviceRoleKey: string
  ) {}

  static fromEnv(): SupabaseAuthClient | null {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) {
      return null;
    }
    return new SupabaseAuthClient(url, serviceRoleKey);
  }

  async createUser(input: SupabaseUserInput): Promise<SupabaseUserResult> {
    const payload = {
      phone: input.phone,
      password: input.password,
      user_metadata: {
        firstName: input.firstName,
        lastName: input.lastName,
        gender: input.gender ?? null,
        dateOfBirth: input.dateOfBirth ?? null,
      },
      phone_confirm: false,
    };
    const user = await this.request<any>("POST", "/auth/v1/admin/users", payload);
    return mapUser(user);
  }

  async updateUser(userId: string, input: SupabaseUserInput): Promise<SupabaseUserResult> {
    const payload = {
      phone: input.phone,
      password: input.password,
      user_metadata: {
        firstName: input.firstName,
        lastName: input.lastName,
        gender: input.gender ?? null,
        dateOfBirth: input.dateOfBirth ?? null,
      },
    };
    const user = await this.request<any>(
      "PUT",
      `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      payload
    );
    return mapUser(user);
  }

  async updateUserPassword(userId: string, password: string): Promise<SupabaseUserResult> {
    const user = await this.request<any>(
      "PUT",
      `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      { password }
    );
    return mapUser(user);
  }

  async sendOtp(phone: string): Promise<void> {
    await this.request("POST", "/auth/v1/otp", {
      phone,
      create_user: false,
    });
  }

  async verifyOtp(input: { phone: string; otp: string }): Promise<SupabaseUserResult> {
    const payload = {
      type: "sms",
      phone: input.phone,
      token: input.otp,
    };
    const verified = await this.request<any>("POST", "/auth/v1/verify", payload);
    const user = verified?.user ?? verified;
    return mapUser(user);
  }

  async signInWithPassword(input: {
    phone: string;
    password: string;
  }): Promise<SupabaseUserResult> {
    const token = await this.request<any>(
      "POST",
      "/auth/v1/token?grant_type=password",
      {
        phone: input.phone,
        password: input.password,
      }
    );
    return mapUser(token?.user ?? token);
  }

  private async request<T>(
    method: "POST" | "PUT",
    path: string,
    body?: unknown
  ): Promise<T> {
    const response = await fetch(new URL(path, this.url), {
      method,
      headers: {
        "Content-Type": "application/json",
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const data = text.length > 0 ? safeParseJson(text) : null;
    if (!response.ok) {
      const error = (data ?? {}) as SupabaseRequestError;
      const message =
        error.error_description ??
        error.message ??
        error.msg ??
        `supabase auth error (${response.status})`;
      throw new SupabaseAuthError(response.status, message);
    }

    return data as T;
  }
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function mapUser(raw: any): SupabaseUserResult {
  const user = raw?.user ?? raw;
  const userId = String(user?.id ?? "").trim();
  if (!userId) {
    throw new SupabaseAuthError(502, "supabase user id missing in response");
  }
  return {
    userId,
    phone: user?.phone != null ? String(user.phone) : null,
    phoneConfirmedAt:
      user?.phone_confirmed_at != null ? String(user.phone_confirmed_at) : null,
    firstName:
      user?.user_metadata?.firstName != null
        ? String(user.user_metadata.firstName).trim() || null
        : null,
    lastName:
      user?.user_metadata?.lastName != null
        ? String(user.user_metadata.lastName).trim() || null
        : null,
    gender:
      user?.user_metadata?.gender != null
        ? String(user.user_metadata.gender).trim() || null
        : null,
    dateOfBirth:
      user?.user_metadata?.dateOfBirth != null
        ? String(user.user_metadata.dateOfBirth).trim() || null
        : null,
  };
}
