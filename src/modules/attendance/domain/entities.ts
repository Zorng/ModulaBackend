// TODO: Define Attendance entities
// Example: Shift, AttendanceRecord

export interface Shift {
  id: string;
  tenantId: string;
  branchId: string;
  userId: string;
  checkInAt: Date;
  checkOutAt?: Date;
  checkInLocation?: { lat: number; lng: number };
  checkOutLocation?: { lat: number; lng: number };
  status: "ACTIVE" | "COMPLETED";
}

export interface AttendanceRecord {
  id: string;
  shiftId: string;
  type: "CHECK_IN" | "CHECK_OUT";
  timestamp: Date;
  location?: { lat: number; lng: number };
}
