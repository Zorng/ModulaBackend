export type AttendanceRecordType = "CHECK_IN" | "CHECK_OUT";
export type AttendanceRequestStatus = "PENDING" | "APPROVED" | "REJECTED";
export type AttendanceRequestType = "CHECK_IN";

export interface AttendanceLocation {
  lat: number;
  lng: number;
}

export interface AttendanceRecord {
  id: string;
  tenantId: string;
  branchId: string;
  employeeId: string;
  type: AttendanceRecordType;
  occurredAt: Date;
  location?: AttendanceLocation;
  createdAt: Date;
}

export interface AttendanceRequest {
  id: string;
  tenantId: string;
  branchId: string;
  employeeId: string;
  requestType: AttendanceRequestType;
  status: AttendanceRequestStatus;
  requestedAt: Date;
  requestedCheckInAt: Date;
  resolvedAt?: Date | null;
  resolvedBy?: string | null;
  attendanceRecordId?: string | null;
  note?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
