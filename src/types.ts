/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = "EMPLOYEE" | "HR" | "MANAGEMENT";

export interface Employee {
  id: string;
  name: string;
  role: UserRole;
  department: string;
  email: string;
  credits: number;
  compliance: number;
  isActive: boolean;
  managerId?: string;
  badges?: string[];
  password?: string;
  isTempPassword?: boolean;
  otpCode?: string;
  otpExpiry?: string;
  empId?: string;
}

export interface ProgressUpdate {
  id: string;
  percentage: number;
  comment: string;
  timestamp: string;
  attachments?: Attachment[];
}

export interface Goal {
  id: string;
  employeeId: string;
  title: string;
  category: "Project" | "Skill" | "Innovation" | "Learning" | "Leadership" | "Team" | "Org";
  priority: "Low" | "Medium" | "High";
  weightage: number;
  progress: number;
  status: "Pending" | "In Progress" | "Completed" | "Approved";
  deadline: string;
  submissionDate?: string;
  history?: ProgressUpdate[];
  attachments?: Attachment[];
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size?: number;
  uploadedAt?: string;
}

export interface Submission {
  id: string;
  employeeId: string;
  weekStarting: string;
  tasks: string[];
  achievements: string[];
  challenges: string[];
  status: "Draft" | "Submitted" | "Approved" | "Returned" | "Rejected";
  managerFeedback?: string;
  attachments?: Attachment[];
  approvedAt?: string;
}

export interface Achievement {
  id: string;
  employeeId: string;
  title: string;
  description: string;
  date: string;
  type: "Innovation" | "KT" | "Client Appreciation" | "Extra Mile" | "Certification";
  status: "Pending" | "Approved" | "Rejected";
  managerComment?: string;
  weightage?: number;
  attachments?: Attachment[];
  approvedAt?: string;
}

export interface DigitalBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

export interface Recognition {
  id: string;
  employeeId: string;
  type: "Month" | "Year";
  period: string; // e.g. "May 2024"
  date: string;
  reason: string;
}

export interface PerformanceInsight {
  employeeId: string;
  skillGaps: string[];
  attritionRisk: "Low" | "Medium" | "High";
  growthPath: string;
  lastUpdated: string;
}

export interface Appraisal {
  id: string;
  employeeId: string;
  cycleId: string;
  step: "Self" | "Manager" | "HR" | "Leadership" | "Completed";
  selfReview?: string;
  managerReview?: string;
  hrReview?: string;
  hikePercent?: number;
  promotionRecommended: boolean;
  finalScore: number;
  aiSummary?: string;
  insights?: PerformanceInsight;
}

export interface Complaint {
  id: string;
  employeeId: string;
  title: string;
  description: string;
  type: "Timesheet" | "Leave" | "Deadline" | "Behavioral";
  penaltyPoints: number;
  date: string;
  status: "Registered" | "Validated" | "Dismissed";
  nullificationComment?: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: "Goal" | "Submission" | "Appraisal" | "Complaint" | "System";
  read: boolean;
  date: string;
}

export interface AppraisalCycle {
  id: string;
  name: string;
  type: "Monthly" | "Yearly";
  status: "Drafted" | "Active" | "Completed" | "Archived";
  startDate: string;
  endDate: string;
  year: number;
  month?: number; // 1-12 for monthly
}

export interface ManualAdjustment {
  id: string;
  employeeId: string;
  type: "Credit" | "Penalty";
  amount: number;
  reason: string;
  actorId: string;
  date: string;
}

export interface MonthlyScore {
  id: string;
  employeeId: string;
  cycleId: string;
  score: number;
  month: number;
  year: number;
}

export interface AuditLog {
  id: string;
  action: "CREATE" | "EDIT" | "STATUS_CHANGE" | "ROLE_CHANGE" | "PERMISSION_CHANGE";
  actorId: string;
  targetId: string;
  details: string;
  timestamp: string;
}

export interface RolePermission {
  role: UserRole;
  modules: {
    dashboard: boolean;
    goals: boolean;
    teamGoals: boolean;
    submissions: boolean;
    complaints: boolean;
    appraisal: boolean;
    admin: boolean;
    settings: boolean;
  };
  actions: {
    approveSubmissions: boolean;
    assignGoals: boolean;
    manageUsers: boolean;
    createComplaints: boolean;
  };
}

export interface PointConfig {
  weeklySubmission: number;
  achievement: number;
  certification: number;
}

export interface AppData {
  employees: Employee[];
  goals: Goal[];
  submissions: Submission[];
  achievements: Achievement[];
  appraisals: Appraisal[];
  appraisalCycles: AppraisalCycle[];
  complaints: Complaint[];
  notifications: Notification[];
  monthlyScores: MonthlyScore[];
  manualAdjustments: ManualAdjustment[];
  auditLogs: AuditLog[];
  permissions: RolePermission[];
  badges: DigitalBadge[];
  recognitions: Recognition[];
  pointConfig: PointConfig;
}
