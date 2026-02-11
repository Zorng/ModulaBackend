# Quick Start: Device-Agnostic Cash Sessions

## For Frontend Developers

### Opening a Session (Web/Mobile)

```typescript
// Before (OLD - required dummy register)
const response = await fetch("/v1/cash/sessions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    registerId: "some-fake-register-id", // ❌ Had to create this
    openingFloatUsd: 100.0,
    openingFloatKhr: 400000,
  }),
});

// After (NEW - no register needed)
const response = await fetch("/v1/cash/sessions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    // registerId omitted for device-agnostic session ✅
    openingFloatUsd: 100.0,
    openingFloatKhr: 400000,
  }),
});
```

### Getting Active Session

```typescript
// Before (OLD)
const response = await fetch(
  `/v1/cash/sessions/active?registerId=${fakeRegisterId}`, // ❌
  {
    headers: { Authorization: `Bearer ${token}` },
  }
);

// After (NEW)
const response = await fetch("/v1/cash/sessions/active", {
  // ✅ No query params
  headers: { Authorization: `Bearer ${token}` },
});
```

### Closing a Session

```typescript
// Same as before - no changes needed
const response = await fetch(`/v1/cash/sessions/${sessionId}/close`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    countedCashUsd: 250.5,
    countedCashKhr: 1002000,
  }),
});
```

## React Example

```typescript
// hooks/useCashSession.ts
export function useCashSession() {
  const { token } = useAuth();

  const openSession = async (openingFloat: { usd: number; khr: number }) => {
    const response = await fetch("/v1/cash/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        openingFloatUsd: openingFloat.usd,
        openingFloatKhr: openingFloat.khr,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    return response.json();
  };

  const getActiveSession = async () => {
    const response = await fetch("/v1/cash/sessions/active", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 404) {
      return null; // No active session
    }

    if (!response.ok) {
      throw new Error("Failed to fetch active session");
    }

    const data = await response.json();
    return data.data;
  };

  const closeSession = async (
    sessionId: string,
    counted: { usd: number; khr: number }
  ) => {
    const response = await fetch(`/v1/cash/sessions/${sessionId}/close`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        countedCashUsd: counted.usd,
        countedCashKhr: counted.khr,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    return response.json();
  };

  return { openSession, getActiveSession, closeSession };
}
```

## Common Patterns

### Check if Session is Required Before Sale

```typescript
async function createSale(saleData) {
  // Check if there's an active session
  const activeSession = await getActiveSession();

  if (!activeSession) {
    throw new Error("No active cash session. Please open a session first.");
  }

  // Proceed with sale...
  return await createSaleAPI(saleData);
}
```

### Session Management Component

```typescript
function CashSessionManager() {
  const [session, setSession] = useState(null);
  const { openSession, getActiveSession, closeSession } = useCashSession();

  useEffect(() => {
    // Load active session on mount
    getActiveSession().then(setSession);
  }, []);

  const handleOpenSession = async () => {
    try {
      const newSession = await openSession({ usd: 100, khr: 400000 });
      setSession(newSession.data);
      toast.success("Session opened successfully");
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleCloseSession = async () => {
    // Show dialog to enter counted cash...
    const counted = await showCountDialog();

    try {
      await closeSession(session.id, counted);
      setSession(null);
      toast.success("Session closed successfully");
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <div>
      {!session ? (
        <Button onClick={handleOpenSession}>Open Cash Session</Button>
      ) : (
        <>
          <SessionStatus session={session} />
          <Button onClick={handleCloseSession}>Close Session</Button>
        </>
      )}
    </div>
  );
}
```

## Error Handling

```typescript
const response = await fetch("/v1/cash/sessions", {
  method: "POST",
  body: JSON.stringify({ openingFloatUsd: 100, openingFloatKhr: 400000 }),
});

if (!response.ok) {
  const error = await response.json();

  switch (response.status) {
    case 400:
      // Business logic error (e.g., session already open)
      alert(error.error);
      break;
    case 401:
      // Not authenticated
      redirectToLogin();
      break;
    case 422:
      // Validation error
      showValidationErrors(error.details);
      break;
    default:
      alert("An unexpected error occurred");
  }
}
```

## Testing Checklist

- [ ] Open a device-agnostic session (no registerId)
- [ ] Verify only one session can be open per branch
- [ ] Try opening a second session (should fail with error)
- [ ] Fetch active session without registerId query param
- [ ] Record cash movements in the session
- [ ] Close the session and verify variance calculation
- [ ] Verify sales are blocked when no session is open
- [ ] Test takeover functionality (manager role)

## Migration from Old Code

### Remove These:

```typescript
// ❌ Remove register creation
const register = await createDefaultRegister();

// ❌ Remove registerId from requests
registerId: register.id

// ❌ Remove registerId from queries
?registerId=${registerId}
```

### Keep These:

```typescript
// ✅ Opening float amounts
openingFloatUsd: 100.0
openingFloatKhr: 400000

// ✅ Closing with counted cash
countedCashUsd: 250.50
countedCashKhr: 1002000

// ✅ Authentication headers
'Authorization': `Bearer ${token}`
```

## FAQ

**Q: Can I still use registers?**  
A: Yes! The system is backward compatible. If you pass `registerId`, it works as before.

**Q: Can I have multiple sessions in one branch?**  
A: Only if they're register-based. Device-agnostic sessions allow only one per branch.

**Q: Do I need to manage registers at all?**  
A: Not for web/mobile clients. Registers are optional now.

**Q: What if I pass registerId sometimes and omit it other times?**  
A: Both work independently. Register-based and device-agnostic sessions are separate.
