/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import logoImg from "./logo.jpg";
import { 
  BarChart3, 
  Target, 
  ClipboardList, 
  Trophy, 
  ShieldCheck, 
  Users, 
  Settings, 
  Bell, 
  LogOut, 
  ChevronRight,
  ChevronLeft,
  TrendingUp,
  Award,
  Zap,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Menu,
  X,
  Plus,
  Minus,
  Sparkles,
  Search,
  Filter,
  ArrowUpDown,
  CheckSquare,
  Square,
  History,
  GitGraph,
  Play,
  XCircle,
  Trash2,
  Paperclip,
  Terminal,
  CheckCircle,
  Shield,
  Lock,
  FileText,
  ExternalLink,
  Upload,
  Inbox,
  ArrowRight,
  Mail,
  User,
  Key,
  Eye,
  EyeOff,
  Camera,
  Edit2,
  RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format, startOfWeek, addDays, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
import { cn } from "./lib/utils";
import { Employee, AppData, UserRole, Goal, Submission, Achievement, Appraisal, Complaint, AppraisalCycle, Notification, MonthlyScore, AuditLog, RolePermission, ManualAdjustment, Attachment, PointConfig } from "./types";
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';

// --- Contexts ---

const AuthContext = createContext<{
  user: Employee | null;
  setUser: (user: Employee | null) => void;
  switchRole: (role: UserRole) => void;
  login: (emp: Employee) => void;
  logout: () => void;
} | null>(null);

const DataContext = createContext<{
  data: AppData;
  updateData: (newData: AppData, skipLoadingOverlay?: boolean) => Promise<void>;
  createAuditLog: (action: AuditLog["action"], targetId: string, details: string, actorId?: string) => AuditLog;
  loading: boolean;
  showToast: (message: string, type?: 'success' | 'error') => void;
  reloadData: () => Promise<void>;
} | null>(null);

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error("useData must be used within DataProvider");

  const isSettings = typeof window !== "undefined" && window.location.pathname === "/settings";
  if (!isSettings && context.data) {
    const activeEmps = context.data.employees ? context.data.employees.filter(e => e.isActive) : [];
    const activeEmpIds = new Set(activeEmps.map(e => e.id));

    const filteredGoals = context.data.goals ? context.data.goals.filter(g => activeEmpIds.has(g.employeeId)) : [];
    const filteredSubmissions = context.data.submissions ? context.data.submissions.filter(s => activeEmpIds.has(s.employeeId)) : [];
    const filteredAchievements = context.data.achievements ? context.data.achievements.filter(a => activeEmpIds.has(a.employeeId)) : [];
    const filteredComplaints = context.data.complaints ? context.data.complaints.filter(c => activeEmpIds.has(c.employeeId)) : [];
    const filteredAppraisals = context.data.appraisals ? context.data.appraisals.filter(ap => activeEmpIds.has(ap.employeeId)) : [];
    const filteredMonthlyScores = context.data.monthlyScores ? context.data.monthlyScores.filter(ms => activeEmpIds.has(ms.employeeId)) : [];
    const filteredManualAdjustments = context.data.manualAdjustments ? context.data.manualAdjustments.filter(ma => activeEmpIds.has(ma.employeeId)) : [];
    const filteredNotifications = context.data.notifications ? context.data.notifications.filter(n => activeEmpIds.has(n.userId)) : [];
    const filteredRecognitions = context.data.recognitions ? context.data.recognitions.filter(r => activeEmpIds.has(r.employeeId)) : [];

    return {
      ...context,
      data: {
        ...context.data,
        employees: activeEmps,
        goals: filteredGoals,
        submissions: filteredSubmissions,
        achievements: filteredAchievements,
        complaints: filteredComplaints,
        appraisals: filteredAppraisals,
        monthlyScores: filteredMonthlyScores,
        manualAdjustments: filteredManualAdjustments,
        notifications: filteredNotifications,
        recognitions: filteredRecognitions
      }
    };
  }

  return context;
};

const parseLocalDate = (dateVal: string | Date | undefined | null): Date => {
  if (!dateVal) return new Date();
  if (dateVal instanceof Date) return dateVal;
  const parts = dateVal.split('T')[0].split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  return new Date(dateVal);
};

const formatEmpName = (emp?: Employee | null): string => {
  if (!emp) return "";
  return emp.name;
};

const formatEmpNameById = (id: string, employees: Employee[]): string => {
  const emp = employees.find(e => e.id === id);
  return formatEmpName(emp);
};

const getInitials = (name?: string | null): string => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  return name.trim().charAt(0).toUpperCase();
};

// --- API Service ---

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "";

const API = {
  fetchData: async () => {
    const res = await fetch(`${API_BASE_URL}/api/db`);
    const d = await res.json();
    return d;
  },
  saveData: async (data: AppData) => {
    await fetch(`${API_BASE_URL}/api/db`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  }
};

// --- AI Service ---

const AIService = {
  genAI: new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" }),

  predictCandidates: async (employees: Employee[]) => {
    const data = employees.map(e => ({ name: e.name, credits: e.credits, compliance: e.compliance }));
    try {
      const response = await AIService.genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `
          Based on the following employee metrics, predict potential 'Employee of the Month' and 'Employee of the Year' candidates.
          Data: ${JSON.stringify(data)}

          Identify:
          - EOM Candidate: Name + Why
          - EOY Candidate: Name + Why
          - High Potential Rising Star: Name
        `
      });
      return response.text || "No candidates identified.";
    } catch (error) {
      return "Candidate prediction engine offline.";
    }
  }
};

// --- Appraisal Utils ---

const APPRAISAL_MONTHLY_START_DAY = 15;
const APPRAISAL_YEARLY_START_MONTH = 6; // July (0-indexed)

const getActiveCycleInfo = () => {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth();
  const year = now.getFullYear();

  // Monthly: 15th to 14th
  let mStart, mEnd, mLabel, mMonth, mYear;
  if (day >= APPRAISAL_MONTHLY_START_DAY) {
    mStart = new Date(year, month, APPRAISAL_MONTHLY_START_DAY);
    mEnd = new Date(year, month + 1, APPRAISAL_MONTHLY_START_DAY - 1);
    mMonth = month + 1;
    mYear = year;
  } else {
    mStart = new Date(year, month - 1, APPRAISAL_MONTHLY_START_DAY);
    mEnd = new Date(year, month, APPRAISAL_MONTHLY_START_DAY - 1);
    mMonth = month === 0 ? 12 : month;
    mYear = month === 0 ? year - 1 : year;
  }
  mLabel = format(mStart, "MMM dd") + " – " + format(mEnd, "MMM dd");

  // Yearly: July 1 to June 30
  let yStart, yEnd, yLabel, yYear;
  if (month >= APPRAISAL_YEARLY_START_MONTH) {
    yStart = new Date(year, APPRAISAL_YEARLY_START_MONTH, 1);
    yEnd = new Date(year + 1, APPRAISAL_YEARLY_START_MONTH - 1, 30);
    yYear = year;
  } else {
    yStart = new Date(year - 1, APPRAISAL_YEARLY_START_MONTH, 1);
    yEnd = new Date(year, APPRAISAL_YEARLY_START_MONTH - 1, 30);
    yYear = year - 1;
  }
  yLabel = format(yStart, "MMM yyyy") + " – " + format(yEnd, "MMM yyyy");

  return { 
    monthly: { id: `monthly-${mMonth}-${mYear}`, start: mStart, end: mEnd, label: mLabel, month: mMonth, year: mYear }, 
    yearly: { id: `yearly-${yYear}`, start: yStart, end: yEnd, label: yLabel, year: yYear } 
  };
};

const calculateSubmissionPoints = (sub: Submission, pointConfig?: PointConfig) => {
  const basePoints = pointConfig?.weeklySubmission || 5;
  // Use simple logic as per Review: each activity count can be a factor or fixed
  // The user said "If Review received +5 Monthly must also receive +5"
  // This implies the submission itself is usually the unit.
  return basePoints;
};

const getPerformanceEvents = (data: AppData, employeeId: string, startDate: Date, endDate: Date) => {
  const events: any[] = [];
  
  // Goals
  data.goals.filter(g => g.employeeId === employeeId && g.status === "Approved").forEach(g => {
    const date = g.submissionDate || "";
    if (date && parseLocalDate(date) >= startDate && parseLocalDate(date) <= endDate) {
      events.push({ date: date, title: `Goal Completed: ${g.title}`, type: 'goal', impact: g.weightage || 20 });
    }
  });

  // Submissions
  data.submissions.filter(s => s.employeeId === employeeId && s.status === "Approved").forEach(s => {
    // Prioritize approvedAt for monthly cycle attribution as per user request
    const date = s.approvedAt || s.weekStarting; 
    if (parseLocalDate(date) >= startDate && parseLocalDate(date) <= endDate) {
      const points = calculateSubmissionPoints(s, data.pointConfig);
      events.push({ date: date, title: `Weekly Submission Approved (${s.achievements.length} activities)`, type: 'submission', impact: points });
    }
  });

  // Achievements
  data.achievements.filter(a => a.employeeId === employeeId && a.status === "Approved").forEach(a => {
    const date = a.approvedAt || a.date;
    if (parseLocalDate(date) >= startDate && parseLocalDate(date) <= endDate) {
      let points = data.pointConfig?.achievement || 10;
      if (a.type === "Certification") points = data.pointConfig?.certification || 15;
      events.push({ date: a.date, title: `Achievement: ${a.title}`, type: 'achievement', impact: a.weightage || points });
    }
  });

  // Manual Adjustments
  (data.manualAdjustments || []).filter(adj => adj.employeeId === employeeId).forEach(adj => {
    if (parseLocalDate(adj.date) >= startDate && parseLocalDate(adj.date) <= endDate) {
      const impact = adj.type === "Credit" ? adj.amount : -adj.amount;
      events.push({ date: adj.date, title: `Manual Adjustment: ${adj.reason}`, type: adj.type === "Credit" ? 'merit' : 'complaint', impact });
    }
  });

  // Complaints (Demerits)
  data.complaints.filter(c => c.employeeId === employeeId && c.status === "Validated").forEach(c => {
    if (parseLocalDate(c.date) >= startDate && parseLocalDate(c.date) <= endDate) {
      events.push({ date: c.date, title: `Infraction: ${c.type}`, type: 'complaint', impact: -c.penaltyPoints });
    }
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
};

// --- UI Components ---

const Card = ({ children, className, title, subtitle, onClick }: { children: React.ReactNode; className?: string; title?: string; subtitle?: string; onClick?: () => void }) => (
  <div 
    onClick={onClick} 
    className={cn(
      "bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8", 
      "overflow-visible h-full", 
      className
    )}
  >
    {title && (
      <div className={subtitle ? "mb-6" : ""}>
        <h3 className={cn(
          "text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-1 break-words leading-relaxed",
          subtitle ? "mb-1" : "mb-6"
        )}>
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-slate-400 font-bold px-1">{subtitle}</p>
        )}
      </div>
    )}
    <div className="relative">
      {children}
    </div>
  </div>
);

const Badge = ({ variant = "default", children, className }: { variant?: "default" | "success" | "warning" | "danger"; children: React.ReactNode, className?: string }) => {
  const colors = {
    default: "bg-slate-100 text-slate-600 border-slate-200",
    success: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    danger: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  };
  return (
    <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border", colors[variant], className)}>
      {children}
    </span>
  );
};

// --- Views ---

const Dashboard = () => {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<"personal" | "org">("org");

  if (!user) return null;

  if (user.role === "EMPLOYEE") {
    return <UserDashboardView />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2 px-2">
        <button 
          onClick={() => setViewMode("org")}
          className={cn(
            "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
            viewMode === "org" ? "bg-slate-900 text-white shadow-lg" : "bg-white text-slate-400 hover:bg-slate-50"
          )}
        >
          Organizational View
        </button>
        <button 
          onClick={() => setViewMode("personal")}
          className={cn(
            "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
            viewMode === "personal" ? "bg-slate-900 text-white shadow-lg" : "bg-white text-slate-400 hover:bg-slate-50"
          )}
        >
          Personal View
        </button>
      </div>
      {viewMode === "org" ? <AdminDashboardView /> : <UserDashboardView />}
    </div>
  );
};

const AdminDashboardView = () => {
  const { data } = useData();
  const { user } = useAuth();
  
  const totalEmployees = data.employees.length;
  const activeEmployees = data.employees.filter(e => e.isActive).length;
  const totalCredits = data.employees.reduce((acc, e) => acc + e.credits, 0);
  const totalComplaints = data.complaints.filter(c => c.status === "Registered").length;
  const completedGoals = data.goals.filter(g => g.status === "Approved").length;
  
  const topPerformers = [...data.employees].sort((a, b) => b.credits - a.credits).slice(0, 5);
  const lowPerformers = [...data.employees].sort((a, b) => a.credits - b.credits).slice(0, 5);
 
  const deptPerformance = Array.from(new Set(data.employees.map(e => e.department))).map(dept => {
    const deptEmps = data.employees.filter(e => e.department === dept);
    const avg = Math.round(deptEmps.reduce((acc, e) => acc + e.credits, 0) / (deptEmps.length || 1));
    return { name: dept, avg, count: deptEmps.length };
  });
 
  return (
    <div className="space-y-6">
       <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-slate-900 uppercase">Organization Overview</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Intelligence Dashboard • {format(new Date(), "MMMM yyyy")}</p>
        </div>
      </header>
 
      {/* Bento Grid Refactor */}
      <div className="grid grid-cols-12 gap-4 auto-rows-min">
         {/* Key Stats Row */}
         <div className="col-span-12 lg:col-span-3 bg-slate-900 rounded-2xl p-8 text-white flex flex-col justify-between shadow-xl">
            <div>
              <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Total Workforce</p>
              <h2 className="text-5xl font-black tabular-nums">{totalEmployees}</h2>
            </div>
            <div className="mt-4 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400 border-t border-white/10 pt-4">
               <span>{activeEmployees} Active</span>
               <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
         </div>
 
         <div className="col-span-12 lg:col-span-3 bg-white rounded-2xl p-8 border border-slate-200 flex flex-col justify-between shadow-sm">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Points</p>
              <h2 className="text-5xl font-black text-slate-900 tabular-nums">{totalCredits}</h2>
            </div>
            <div className="mt-4 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
               <div className="bg-indigo-600 h-full" style={{ width: `${Math.min(100, (totalCredits / 1000) * 100)}%` }} />
            </div>
         </div>
 
         <div className="col-span-12 lg:col-span-3 bg-indigo-50 rounded-2xl p-8 border border-indigo-100 flex flex-col justify-between">
            <div>
              <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-1">Goal completion</p>
              <h2 className="text-5xl font-black text-indigo-900 tabular-nums">{completedGoals}</h2>
            </div>
            <p className="mt-4 text-[9px] text-indigo-600 font-black uppercase tracking-widest ">+12% vs last month</p>
         </div>
 
         <div className="col-span-12 lg:col-span-3 bg-rose-50 rounded-2xl p-8 border border-rose-100 flex flex-col justify-between">
            <div>
              <p className="text-[10px] font-bold text-rose-600 uppercase tracking-widest mb-1">Total Complaints</p>
              <h2 className="text-5xl font-black text-rose-900 tabular-nums">{totalComplaints}</h2>
            </div>
            {totalComplaints > 0 ? (
              <Badge variant="danger">Needs intervention</Badge>
            ) : (
              <Badge variant="success">All Clear</Badge>
            )}
         </div>

         {/* Middle Row */}
         <Card className="col-span-12 lg:col-span-8 p-0 overflow-hidden" title="Designation-based Performance Distribution">
            <div className="px-8 pb-8 space-y-5">
               {deptPerformance.map(dept => (
                 <div key={dept.name} className="group">
                    <div className="flex justify-between items-end mb-2">
                       <span className="text-[11px] font-black text-slate-700 uppercase tracking-widest">{dept.name}</span>
                       <span className="text-[10px] font-bold text-slate-400">{dept.avg}/1000</span>
                    </div>
                    <div className="flex items-center gap-4">
                       <div className="flex-1 bg-slate-100 h-2.5 rounded-full overflow-hidden">
                          <motion.div 
                           initial={{ width: 0 }} animate={{ width: `${dept.avg/10}%` }}
                           className="h-full bg-indigo-500 group-hover:bg-indigo-600 transition-colors"
                          />
                       </div>
                       <span className="text-[9px] font-black text-slate-900 w-8">{dept.count}</span>
                    </div>
                 </div>
               ))}
            </div>
         </Card>

         <Card className="col-span-12 lg:col-span-4 bg-slate-50 flex flex-col items-center justify-center text-center p-10" title="Compliance Benchmark">
            <div className="relative w-40 h-40">
               <svg className="w-full h-full transform -rotate-90">
                 <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="16" fill="transparent" className="text-white shadow-inner" />
                 <motion.circle 
                   cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="16" fill="transparent" 
                   strokeDasharray="439.8"
                   initial={{ strokeDashoffset: 439.8 }}
                   animate={{ strokeDashoffset: 439.8 - (439.8 * data.employees.reduce((acc, e) => acc + e.compliance, 0) / (totalEmployees || 1)) / 100 }}
                   className="text-indigo-600" 
                 />
               </svg>
               <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-black text-slate-900 tracking-tighter">
                    {Math.round(data.employees.reduce((acc, e) => acc + e.compliance, 0) / (totalEmployees || 1))}%
                  </span>
                  <span className="text-[8px] font-black uppercase text-slate-400 tracking-[0.2em] mt-1">Audit Ready</span>
               </div>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-4 w-full border-t border-slate-200 pt-8">
               <div className="text-left">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Active Complaints</p>
                  <p className="text-lg font-black text-rose-600">{data.complaints.filter(c => c.status !== "Dismissed").length}</p>
               </div>
               <div className="text-right">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Infractions</p>
                  <p className="text-lg font-black text-rose-900">{data.complaints.filter(c => c.status === "Validated").length}</p>
               </div>
            </div>
         </Card>

         {/* Bottom Talent Insight Row */}
         <div className="col-span-12 flex items-center justify-between mt-8 mb-4 px-2">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-900">Top Performers</h3>
            <div className="flex gap-2">
               <Badge variant="success">Rising Stars</Badge>
            </div>
         </div>

         <div className="col-span-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {topPerformers.slice(0, 4).map((emp, i) => (
              <div key={emp.id} className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:border-indigo-200 transition-all group">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-lg font-black group-hover:scale-110 transition-transform">
                       {getInitials(emp.name)}
                    </div>
                    <div>
                       <p className="text-xs font-black text-slate-900">{formatEmpName(emp)}</p>
                       <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{emp.department}</p>
                    </div>
                 </div>
                 <div className="mt-6 flex justify-between items-end">
                    <span className="text-2xl font-black text-slate-900 tabular-nums">{emp.credits}</span>
                    <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">RANK #{i+1}</span>
                 </div>
              </div>
            ))}
         </div>
      </div>
    </div>
  );
};

const UserDashboardView = () => {
  const { user } = useAuth();
  const { data, updateData } = useData();
  const [tempAttachments, setTempAttachments] = useState<File[]>([]);
  const [showAchievementModal, setShowAchievementModal] = useState(false);
  const [newAchievement, setNewAchievement] = useState<Partial<Achievement>>({
    title: "",
    description: "",
    type: "Innovation",
    date: new Date().toISOString().split("T")[0]
  });

  if (!user) return null;

  const userGoals = data.goals.filter(g => g.employeeId === user.id);
  const userSubmissions = data.submissions.filter(s => s.employeeId === user.id);
  
  const activeMonthlyCycle = data.appraisalCycles.find(c => c.type === "Monthly" && c.status === "Active");
  const activeYearlyCycle = data.appraisalCycles.find(c => c.type === "Yearly" && c.status === "Active");

  const dashboardGoals = userGoals.slice(0, 3);
  const avgProgress = Math.round(userGoals.reduce((acc, g) => acc + g.progress, 0) / (userGoals.length || 1));
  
  const completedGoals = userGoals.filter(g => g.status === "Approved" || g.status === "Completed").length;
  const totalGoals = userGoals.length;
  const recentSubmissions = userSubmissions.length;
  const activeComplaints = data.complaints.filter(c => c.employeeId === user.id && c.status !== "Dismissed").length;

  const handleReportAchievement = async () => {
    if (!newAchievement.title) return;
    
    // Simulate file upload
    const attachments: Attachment[] = tempAttachments.map(f => ({
      id: `att-${Date.now()}-${Math.random()}`,
      name: f.name,
      url: "#",
      type: f.type,
      size: f.size,
      uploadedAt: new Date().toISOString()
    }));

    const achievement: Achievement = {
      id: `ach-${Date.now()}`,
      employeeId: user.id,
      title: newAchievement.title as string,
      description: newAchievement.description || "",
      type: newAchievement.type as any,
      date: newAchievement.date as string,
      status: "Approved", // Auto-approved for this version
      attachments
    };

    // Calculate points based on type from pointConfig
    let points = data.pointConfig?.achievement || 10;
    if (achievement.type === "Certification") {
      points = data.pointConfig?.certification || 15;
    }

    const newEmployees = data.employees.map(e => 
      e.id === user.id ? { ...e, credits: Math.min(1000, e.credits + points) } : e
    );

    await updateData({
      ...data,
      achievements: [achievement, ...(data.achievements || [])],
      employees: newEmployees
    });

    setShowAchievementModal(false);
    setNewAchievement({
      title: "",
      description: "",
      type: "Innovation",
      date: new Date().toISOString().split("T")[0]
    });
    setTempAttachments([]);
  };

  return (
    <div className="space-y-6">
      {/* Achievement Modal */}
      {showAchievementModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
           <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl p-10 relative">
              <button 
                onClick={() => setShowAchievementModal(false)}
                className="absolute top-8 right-8 p-3 hover:bg-slate-50 rounded-full text-slate-400 transition-colors"
              ><X className="w-6 h-6" /></button>
              
              <div className="mb-10">
                 <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6">
                    <Award className="w-8 h-8 text-indigo-600" />
                 </div>
                 <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Report Achievement</h2>
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Growth & Professional Excellence</p>
              </div>

              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Title of Achievement</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Completed Cloud Architect Certification"
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900"
                      value={newAchievement.title}
                      onChange={(e) => setNewAchievement({...newAchievement, title: e.target.value})}
                    />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Category</label>
                       <select 
                         className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900"
                         value={newAchievement.type}
                         onChange={(e) => setNewAchievement({...newAchievement, type: e.target.value as any})}
                       >
                          <option value="Innovation">Innovation</option>
                          <option value="KT">KT Session</option>
                          <option value="Client Appreciation">Client Appreciation</option>
                          <option value="Extra Mile">Extra Mile</option>
                          <option value="Certification">Certification</option>
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Execution Date</label>
                       <input 
                         type="date" 
                         className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-900"
                         value={newAchievement.date}
                         onChange={(e) => setNewAchievement({...newAchievement, date: e.target.value})}
                       />
                    </div>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Context & Impact</label>
                    <textarea 
                      placeholder="Describe the achievement and its impact on the organization..."
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-600"
                      rows={3}
                      value={newAchievement.description}
                      onChange={(e) => setNewAchievement({...newAchievement, description: e.target.value})}
                    />
                 </div>
                 
                 <FileUploader onUpload={(files) => setTempAttachments(prev => [...prev, ...files])} label="Proof of Evidence" />
                 {tempAttachments.length > 0 && (
                   <div className="flex flex-wrap gap-2">
                      {tempAttachments.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-xl text-[10px] font-bold text-indigo-600">
                           <Paperclip className="w-3.5 h-3.5" />
                           {f.name}
                        </div>
                      ))}
                   </div>
                 )}
              </div>

              <div className="mt-12 flex gap-4">
                 <button 
                  onClick={() => setShowAchievementModal(false)}
                  className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl text-[10px] font-bold uppercase tracking-widest"
                 >Discard</button>
                 <button 
                  onClick={handleReportAchievement}
                  className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-xl shadow-indigo-600/30"
                 >Commit Achievement</button>
              </div>
           </motion.div>
        </div>
      )}

      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 uppercase">Overview</h1>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-1">Operational Overview • {format(new Date(), "MMM dd")}</p>
        </div>
        <div className="flex gap-4">
          {activeMonthlyCycle && <Badge variant="success">Monthly Cycle Active</Badge>}
          {activeYearlyCycle && <Badge variant="warning">Yearly Appraisal Active</Badge>}
          {!activeMonthlyCycle && !activeYearlyCycle && <Badge variant="danger">Cycle Inactive</Badge>}
        </div>
      </header>

      {/* Bento Grid */}
      <div className="grid grid-cols-12 gap-8">
        
        {/* Left Column: Efficiency & Metrics */}
        <div className="col-span-12 lg:col-span-4 space-y-8">
          {/* Total Credit Score */}
          <div className="bg-slate-900 rounded-[2.5rem] p-10 flex flex-col justify-between text-white shadow-2xl relative overflow-hidden group min-h-[480px]">
            <div className="absolute top-[-20%] right-[-20%] w-64 h-64 bg-indigo-500 rounded-full blur-[80px] opacity-20 group-hover:opacity-30 transition-opacity"></div>
            <div>
              <p className="text-xs font-bold text-indigo-300 uppercase tracking-[0.2em] mb-4">Total Points</p>
              <h2 className="text-9xl font-black tracking-tighter tabular-nums leading-none">{(user.credits).toLocaleString()}</h2>
              <div className="mt-8 flex">
                <Badge variant="success" className="px-4 py-1.5 rounded-full bg-emerald-500/20 text-emerald-400 border-none">
                  {user.credits > 900 ? "Platinum Performer" : user.credits > 750 ? "Gold Status" : "Active Member"}
                </Badge>
              </div>
            </div>
            <div className="space-y-8 mt-12">
              <div className="h-[1px] bg-white/10 w-full"></div>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-3">Weekly Momentum</p>
                  <div className="flex gap-2 items-end h-12">
                    {[30, 50, 70, 90, 85, 60, 95].map((h, i) => (
                      <div key={i} className="w-2.5 rounded-full bg-indigo-500/30 group-hover:bg-indigo-500/60 transition-all duration-500" style={{ height: `${h}%`, transitionDelay: `${i*50}ms` }}></div>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase text-slate-400 tracking-widest mb-1">Issue Index</p>
                  <p className="text-2xl font-black text-rose-400 tracking-tight">{data.complaints.filter(c => c.employeeId === user.id && c.status !== "Dismissed").length}</p>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: Goals & Metrics */}
        <div className="col-span-12 lg:col-span-8 space-y-8">
          <div className="grid grid-cols-12 gap-8">
            {/* Goal Management */}
            <Card className="bg-white rounded-[2.5rem] p-8 col-span-12" title="Goal Management">
              <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-4">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Global Progress</p>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black text-slate-900">{avgProgress}%</span>
                  <Badge variant="default" className="text-[9px]">Target 85%</Badge>
                </div>
              </div>
              <div className="space-y-8">
                {dashboardGoals.slice(0, 3).map(goal => (
                   <div key={goal.id} className="group/goal">
                     <div className="flex justify-between text-[10px] mb-3 font-black uppercase tracking-[0.1em]">
                        <div className="flex flex-col gap-1">
                         <span className="text-slate-900 truncate max-w-[150px]">{goal.title}</span>
                         <div className="flex items-center gap-2">
                            <div className={cn("w-1.5 h-1.5 rounded-full", goal.status === "Approved" ? "bg-emerald-500" : "bg-slate-300")}></div>
                            <span className="text-slate-400 text-[8px]">{goal.status}</span>
                         </div>
                        </div>
                       <span className="text-indigo-600">{goal.progress}%</span>
                     </div>
                     <div className="w-full bg-slate-50 h-3 rounded-full overflow-hidden p-[2px]">
                       <motion.div 
                         initial={{ width: 0 }}
                         animate={{ width: `${goal.progress}%` }}
                         className={cn("h-full rounded-full transition-all duration-1000", goal.progress > 80 ? "bg-indigo-600" : "bg-slate-300")}
                       />
                     </div>
                   </div>
                ))}
                {dashboardGoals.length > 3 && (
                  <div className="pt-4 text-center">
                    <Link to="/goals" className="text-[9px] font-black text-indigo-500 border-b border-indigo-200 uppercase tracking-widest hover:border-indigo-500 transition-colors">View All {dashboardGoals.length} Goals</Link>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Performance Metrics Card */}
          <Card className="bg-white border-slate-200 rounded-[2.5rem] p-8" title="Performance Metrics">
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="flex items-center gap-4 group/item">
                   <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0 group-hover/item:scale-110 transition-transform">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                   </div>
                   <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Goal Completion</p>
                      <p className="text-sm font-black text-slate-900">{completedGoals} / {totalGoals} Tasks</p>
                   </div>
                </div>
                <div className="flex items-center gap-4 group/item">
                   <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0 group-hover/item:scale-110 transition-transform">
                      <TrendingUp className="w-5 h-5 text-indigo-500" />
                   </div>
                   <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Execution Velocity</p>
                      <p className="text-sm font-black text-slate-900">{avgProgress}% Average</p>
                   </div>
                </div>
                <div className="flex items-center gap-4 group/item">
                   <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0 group-hover/item:scale-110 transition-transform">
                      <History className="w-5 h-5 text-amber-500" />
                   </div>
                   <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Reviews Logged</p>
                      <p className="text-sm font-black text-slate-900">{recentSubmissions} Weekly Syncs</p>
                   </div>
                </div>
                <div className="flex items-center gap-4 group/item">
                   <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center shrink-0 group-hover/item:scale-110 transition-transform">
                      <AlertCircle className="w-5 h-5 text-rose-500" />
                   </div>
                   <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Incident Reports</p>
                      <p className="text-sm font-black text-slate-900">{activeComplaints} Active</p>
                   </div>
                </div>
             </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

const GoalsView = () => {
  const { user } = useAuth();
  const { data, updateData, createAuditLog } = useData();
  const [comment, setComment] = useState("");
  const [activeGoalId, setActiveGoalId] = useState<string | null>(null);
  const [tempAttachments, setTempAttachments] = useState<File[]>([]);
  const [historyModalGoal, setHistoryModalGoal] = useState<Goal | null>(null);

  const goals = data.goals.filter(g => g.employeeId === user?.id);

  const updateProgress = async (goalId: string, progress: number, files: File[] = []) => {
    const goal = data.goals.find(g => g.id === goalId);
    if (!goal) return;

    if (progress === 100 && goal.progress < 100) {
      if (!confirm("Are you sure you want to mark this goal as complete and submit for review?")) {
        return;
      }
    }

    const status = (progress === 100 ? "Completed" : "In Progress") as Goal["status"];
    
    // Simulate file upload to get attachment metadata
    const newAttachments: Attachment[] = files.map(f => ({
      id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: f.name,
      url: "#", // In real app, this would be the bucket URL
      type: f.type,
      size: f.size,
      uploadedAt: new Date().toISOString()
    }));

    const update = {
      id: `upd-${Date.now()}`,
      percentage: progress,
      comment: comment || (progress === 100 ? "Goal completed" : "Progress update"),
      timestamp: new Date().toISOString(),
      attachments: newAttachments
    };

    const newGoals = data.goals.map(g => 
      g.id === goalId ? { 
        ...g, 
        progress, 
        status, 
        attachments: [...(g.attachments || []), ...newAttachments],
        submissionDate: status === "Completed" ? new Date().toISOString() : undefined,
        history: [update, ...(g.history || [])]
      } : g
    );
    
    let newNotifications: Notification[] = [...data.notifications];
    if (status === "Completed" && goal.status !== "Completed") {
      // Notify all HR / Management users
      const authorized = data.employees.filter(e => e.role === "HR" || e.role === "MANAGEMENT");
      authorized.forEach(adm => {
        if (adm.id !== user?.id) {
          newNotifications.push({
            id: `n-${Date.now()}-${Math.random()}`,
            userId: adm.id,
            title: "Goal Completed",
            message: `${user?.name} has completed: ${goal.title}`,
            type: "Goal",
            read: false,
            date: new Date().toISOString()
          });
        }
      });
    }

    const log = createAuditLog(
      status !== goal.status ? "STATUS_CHANGE" : "EDIT",
      goalId,
      `Goal progress updated to ${progress}% (${status}) for "${goal.title}"`,
      user?.id
    );

    await updateData({
      ...data,
      goals: newGoals,
      notifications: newNotifications,
      auditLogs: [log, ...data.auditLogs]
    });
    setComment("");
    setActiveGoalId(null);
  };

  return (
    <div className="space-y-6">
       <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 uppercase">My Goals</h1>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-1">Lifecycle Tracking • Q2 2024</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {goals.length === 0 ? (
          <Card className="col-span-full py-20 text-center opacity-30">
            <p className="font-bold uppercase tracking-widest text-xs">No active goals found.</p>
          </Card>
        ) : (
          goals.map(goal => (
            <Card key={goal.id} className="flex flex-col justify-between group hover:border-indigo-200 transition-colors">
              <div className="mb-6">
                <div className="flex justify-between items-start mb-4">
                   <div className="flex gap-2">
                      <Badge variant={goal.status === "Approved" ? "success" : goal.status === "Completed" ? "warning" : "default"}>{goal.status}</Badge>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{goal.category}</span>
                   </div>
                   <Badge variant={goal.priority === "High" ? "danger" : "default"}>{goal.priority}</Badge>
                </div>
                <h3 className="text-lg font-extrabold text-slate-900 leading-tight">{goal.title}</h3>
                <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mt-2">Weightage: {goal.weightage}</p>
              </div>

              <div className="space-y-4">
                 {goal.status !== "Approved" && goal.status !== "Completed" && (
                   <div className="mb-4">
                      <label className="text-[10px] font-bold uppercase text-slate-400 mb-1 block">Progress Update Comment</label>
                      <textarea 
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] focus:ring-1 focus:ring-indigo-100"
                        placeholder="What have you achieved since the last update?"
                        value={activeGoalId === goal.id ? comment : ""}
                        onFocus={() => setActiveGoalId(goal.id)}
                        onChange={(e) => { setActiveGoalId(goal.id); setComment(e.target.value); }}
                      />
                   </div>
                 )}
                 <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest mb-1">
                    <span className="text-slate-400">Progress: {goal.progress}%</span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setHistoryModalGoal(goal)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                        title="View Progress Log"
                      >
                         <History className="w-3.5 h-3.5" />
                      </button>
                      {goal.status !== "Approved" && goal.status !== "Completed" && (
                        <div className="flex items-center gap-1">
                           <button 
                             onClick={() => updateProgress(goal.id, Math.max(0, goal.progress - 5))}
                             className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors"
                           >
                              <Minus className="w-3 h-3" />
                           </button>
                           <button 
                             onClick={() => updateProgress(goal.id, Math.min(100, goal.progress + 5))}
                             className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors"
                           >
                              <Plus className="w-3 h-3" />
                           </button>
                        </div>
                      )}
                    </div>
                 </div>
                 <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-600 rounded-full transition-all duration-300" style={{ width: `${goal.progress}%` }} />
                 </div>

                 {activeGoalId === goal.id ? (
                   <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                      <div className="flex justify-between items-center mb-1">
                         <p className="text-[10px] font-bold uppercase text-slate-400">Completion: {goal.progress}%</p>
                         <div className="flex gap-1">
                            <button 
                              onClick={() => {
                                const next = data.goals.find(g => g.id === goal.id);
                                if (next) {
                                  const prog = Math.max(0, next.progress - 5);
                                  const newGoals = data.goals.map(g => g.id === goal.id ? { ...g, progress: prog } : g);
                                  updateData({ ...data, goals: newGoals });
                                }
                              }}
                              className="p-1 bg-white border border-slate-200 rounded-lg text-slate-400"
                            >
                               <Minus className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={() => {
                                const next = data.goals.find(g => g.id === goal.id);
                                if (next) {
                                  const prog = Math.min(100, next.progress + 5);
                                  const newGoals = data.goals.map(g => g.id === goal.id ? { ...g, progress: prog } : g);
                                  updateData({ ...data, goals: newGoals });
                                }
                              }}
                              className="p-1 bg-white border border-slate-200 rounded-lg text-slate-400"
                            >
                               <Plus className="w-3 h-3" />
                            </button>
                         </div>
                      </div>
                      <input 
                        type="range" min="0" max="100" step="5"
                        value={goal.progress}
                        onChange={(e) => {
                          const prog = parseInt(e.target.value);
                          const newGoals = data.goals.map(g => g.id === goal.id ? { ...g, progress: prog } : g);
                          updateData({ ...data, goals: newGoals });
                        }}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                      <textarea 
                        placeholder="Add a comment about your progress..."
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs"
                        rows={2}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                      />
                      <FileUploader onUpload={(files) => setTempAttachments(prev => [...prev, ...files])} />
                      {tempAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                           {tempAttachments.map((f, i) => (
                             <div key={i} className="flex items-center gap-2 px-2 py-1 bg-slate-100 rounded-lg text-[9px] font-bold text-slate-600">
                                <Paperclip className="w-3 h-3" />
                                {f.name}
                                <button onClick={() => setTempAttachments(prev => prev.filter((_, idx) => idx !== i))} className="text-rose-500">
                                   <X className="w-3 h-3" />
                                </button>
                             </div>
                           ))}
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                         <button onClick={() => { setActiveGoalId(null); setComment(""); setTempAttachments([]); }} className="px-3 py-1.5 text-[10px] font-bold uppercase text-slate-500">Cancel</button>
                         <button onClick={() => { updateProgress(goal.id, goal.progress, tempAttachments); setTempAttachments([]); }} className="px-4 py-1.5 bg-indigo-600 text-white text-[10px] font-bold uppercase rounded-lg shadow-lg shadow-indigo-600/20">Save Changes</button>
                      </div>
                   </div>
                 ) : (
                   goal.status !== "Approved" && goal.status !== "Completed" && (
                    <button 
                      onClick={() => setActiveGoalId(goal.id)}
                      className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:border-indigo-200 hover:text-indigo-600 transition-all"
                    >
                      Update Progress
                    </button>
                   )
                 )}

                 {goal.history && goal.history.length > 0 && (
                   <div className="mt-6 pt-6 border-t border-slate-100">
                      <p className="text-[10px] font-bold uppercase text-indigo-600 tracking-widest mb-4">Progress Log</p>
                      <div className="space-y-4 max-h-40 overflow-y-auto pr-2 scrollbar-hide">
                         {goal.history.map(update => (
                           <div key={update.id} className="relative pl-4 before:absolute before:left-0 before:top-2 before:w-1.5 before:h-1.5 before:bg-indigo-400 before:rounded-full">
                              <p className="text-[10px] font-black text-slate-900 leading-tight">
                                {update.percentage}% Completed
                              </p>
                              <p className="text-[11px] font-medium text-slate-500 my-1">{update.comment}</p>
                              {update.attachments && update.attachments.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                   {update.attachments.map(att => (
                                     <a 
                                       key={att.id} 
                                       href={att.url} 
                                       target="_blank" 
                                       rel="noreferrer"
                                       className="flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[9px] font-bold text-slate-500 hover:text-indigo-600 transition-colors"
                                     >
                                        <Paperclip className="w-2.5 h-2.5" />
                                        {att.name}
                                     </a>
                                   ))}
                                </div>
                              )}
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{format(new Date(update.timestamp), "MMM dd, HH:mm")}</p>
                           </div>
                         ))}
                      </div>
                   </div>
                 )}
              </div>
            </Card>
          ))
        )}
      </div>

      <AnimatePresence>
        {historyModalGoal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="w-full max-w-md"
            >
              <Card 
                title={`Progress Log: ${historyModalGoal.title}`}
                subtitle={`Employee: ${formatEmpName(data.employees.find(e => e.id === user?.id))}`}
              >
                <div className="max-h-[300px] overflow-y-auto pr-2 space-y-4">
                  {historyModalGoal.history && historyModalGoal.history.length > 0 ? (
                    historyModalGoal.history.map((h, index) => (
                      <div key={index} className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-black text-slate-900 bg-slate-200 px-2 py-0.5 rounded-md">
                            {h.percentage}%
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {format(new Date(h.timestamp), "MMM dd, yyyy")}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium leading-relaxed italic">
                          "{h.comment || 'No comment provided'}"
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-4 font-semibold uppercase tracking-widest">No history logs found.</p>
                  )}
                </div>
                <div className="flex justify-end mt-6">
                  <button 
                    onClick={() => setHistoryModalGoal(null)}
                    className="px-6 py-2.5 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all shadow-lg"
                  >
                    Close
                  </button>
                </div>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const TeamGoalsView = () => {
  const { user } = useAuth();
  const { data, updateData, showToast, createAuditLog } = useData();
  const [isAdding, setIsAdding] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [newGoal, setNewGoal] = useState({ 
    employeeId: "", 
    title: "", 
    category: "Project" as Goal["category"], 
    priority: "Medium" as Goal["priority"], 
    weightage: 10, 
    deadline: "" 
  });
  const [historyModalGoal, setHistoryModalGoal] = useState<Goal | null>(null);

  const isHR = user?.role === "HR";
  const isManagement = user?.role === "MANAGEMENT";
  const canSeeAllTeamGoals = isHR || isManagement;

  const allTeamGoals = data.goals.filter(g => {
    const emp = data.employees.find(e => e.id === g.employeeId);
    return !!emp;
  });

  const teamGoals = allTeamGoals.filter(g => {
    const matchesStatus = statusFilter === "ALL" || g.status === statusFilter;
    if (!matchesStatus) return false;
    
    if (searchQuery.trim() !== "") {
      const emp = data.employees.find(e => e.id === g.employeeId);
      if (!emp) return false;
      const query = searchQuery.toLowerCase();
      const matchesName = emp.name.toLowerCase().includes(query);
      const matchesId = emp.empId ? emp.empId.toLowerCase().includes(query) : emp.id.toLowerCase().includes(query);
      return matchesName || matchesId;
    }
    return true;
  });

  const targetEmployees = data.employees;

  const handleCreate = async () => {
    if (!newGoal.employeeId || !newGoal.title) return;
    
    const goal: Goal = {
      ...newGoal,
      id: `g-${Date.now()}`,
      progress: 0,
      status: "Pending",
      deadline: newGoal.deadline || new Date().toISOString()
    };
    
    const newGoals = [...data.goals, goal];
    const newNotifications: Notification[] = [...data.notifications, {
      id: `n-${Date.now()}`,
      userId: goal.employeeId,
      title: "New Goal Assigned",
      message: `A new goal has been assigned: ${goal.title}`,
      type: "Goal",
      read: false,
      date: new Date().toISOString()
    }];

    const log = createAuditLog("CREATE", goal.id, `Goal created: ${goal.title} for user ID: ${goal.employeeId}`, user?.id);
    await updateData({
      ...data,
      goals: newGoals,
      notifications: newNotifications,
      auditLogs: [log, ...data.auditLogs]
    });
    showToast("Goal has been successfully created!", "success");
    setIsAdding(false);
    setNewGoal({ employeeId: "", title: "", category: "Project", priority: "Medium", weightage: 10, deadline: "" });
  };

  const approveGoal = async (goalId: string) => {
    const approvalDate = new Date().toISOString();
    const newGoals = data.goals.map(g => g.id === goalId ? { ...g, status: "Approved" as any, submissionDate: approvalDate } : g);
    const goal = data.goals.find(g => g.id === goalId);
    
    const newNotifications: Notification[] = [...data.notifications, {
      id: `n-${Date.now()}`,
      userId: goal!.employeeId,
      title: "Goal Approved",
      message: `Your goal "${goal?.title}" has been approved.`,
      type: "Goal",
      read: false,
      date: new Date().toISOString()
    }];

    // Update Employee Credits
    const newEmployees = data.employees.map(e =>
      e.id === goal!.employeeId ? {
        ...e,
        credits: Math.min(1000, e.credits + (goal.weightage || 20))
      } : e
    );

    // Update monthly scores (Automatic Point Posting)
    let newMonthlyScores = [...(data.monthlyScores || [])];
    const activeMonthlyCycle = data.appraisalCycles.find(c => c.type === "Monthly" && c.status === "Active");
    if (activeMonthlyCycle && goal) {
      // Check if approval date falls inside active cycle as per user request
      if (new Date(approvalDate) >= new Date(activeMonthlyCycle.startDate) && new Date(approvalDate) <= new Date(activeMonthlyCycle.endDate)) {
        const scoreIndex = newMonthlyScores.findIndex(ms => ms.employeeId === goal.employeeId && ms.cycleId === activeMonthlyCycle.id);
        const impact = goal.weightage || 20;
        if (scoreIndex >= 0) {
          newMonthlyScores[scoreIndex].score += impact;
        } else {
          newMonthlyScores.push({
            id: `ms-${Date.now()}`,
            employeeId: goal.employeeId,
            cycleId: activeMonthlyCycle.id,
            score: impact,
            month: activeMonthlyCycle.month || new Date().getMonth() + 1,
            year: activeMonthlyCycle.year
          });
        }
      }
    }

    const log = createAuditLog("STATUS_CHANGE", goalId, `Goal approved: "${goal?.title}"`, user?.id);
    await updateData({ 
      ...data, 
      goals: newGoals, 
      notifications: newNotifications, 
      monthlyScores: newMonthlyScores,
      employees: newEmployees,
      auditLogs: [log, ...data.auditLogs]
    });
  };

  return (
    <div className="space-y-6">
       <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 uppercase">My Team Goals</h1>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-1">Management Dashboard • {teamGoals.length} Shown</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <input 
              type="text"
              placeholder="Search by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold uppercase tracking-widest focus:ring-2 focus:ring-indigo-100 placeholder-slate-400 min-w-[200px]"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold uppercase tracking-widest focus:ring-2 focus:ring-indigo-100"
          >
            <option value="ALL">All Status</option>
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Approved">Approved</option>
          </select>
          <button 
            onClick={() => setIsAdding(true)}
            className="px-6 py-3 bg-indigo-600 text-white font-bold uppercase text-[10px] tracking-widest rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 whitespace-nowrap"
          >
            Assign New Goal
          </button>
        </div>
      </header>

      {isAdding && (
        <Card title="Assign New Goal" className="mb-8">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                 <label className="text-[10px] font-bold uppercase text-slate-400">Employee</label>
                 <select 
                   className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                   value={newGoal.employeeId}
                   onChange={(e) => setNewGoal({...newGoal, employeeId: e.target.value})}
                 >
                   <option value="">Select Employee</option>
                   {targetEmployees.map(e => (
                     <option key={e.id} value={e.id}>{formatEmpName(e)} ({e.role})</option>
                   ))}
                 </select>
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] font-bold uppercase text-slate-400">Goal Category</label>
                 <select 
                   className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                   value={newGoal.category}
                   onChange={(e) => setNewGoal({...newGoal, category: e.target.value as any})}
                 >
                   <option value="Project">Project</option>
                   <option value="Skill">Skill</option>
                   <option value="Innovation">Innovation</option>
                   <option value="Learning">Learning</option>
                   <option value="Leadership">Leadership</option>
                   <option value="Team">Team</option>
                   <option value="Org">Org</option>
                 </select>
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] font-bold uppercase text-slate-400">Weightage (Points)</label>
                 <input 
                   type="number" value={newGoal.weightage}
                   className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                   onChange={(e) => setNewGoal({...newGoal, weightage: parseInt(e.target.value) || 0})}
                 />
              </div>
              <div className="md:col-span-2 space-y-2">
                 <label className="text-[10px] font-bold uppercase text-slate-400">Goal Title</label>
                 <input 
                   type="text" placeholder="e.g. Complete high-priority Q2 initiative"
                   value={newGoal.title}
                   className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                   onChange={(e) => setNewGoal({...newGoal, title: e.target.value})}
                 />
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] font-bold uppercase text-slate-400">Deadline</label>
                 <input 
                   type="date" 
                   className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                   onChange={(e) => setNewGoal({...newGoal, deadline: e.target.value})}
                 />
              </div>
           </div>
           <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => setIsAdding(false)}
                className="px-6 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500"
              >Cancel</button>
              <button 
                onClick={handleCreate}
                className="px-6 py-2 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl"
              >Create Goal</button>
           </div>
        </Card>
      )}

      <div className="space-y-4">
        {teamGoals.map(goal => (
          <Card key={goal.id}>
             <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 w-full">
                <div className="flex items-center gap-6">
                   <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center font-bold text-slate-400 border border-slate-100 shrink-0">
                      {getInitials(data.employees.find(e => e.id === goal.employeeId)?.name)}
                   </div>
                   <div>
                     <h4 className="font-bold text-slate-900">{goal.title}</h4>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                       {formatEmpNameById(goal.employeeId, data.employees)} • {goal.category}
                     </p>
                   </div>
                </div>
                <div className="flex items-center gap-6 ml-auto sm:ml-0">
                   <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-slate-900">{goal.progress}%</span>
                      <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Wt: {goal.weightage}</span>
                      <Badge variant={goal.status === "Approved" ? "success" : goal.status === "Completed" ? "warning" : "default"}>{goal.status}</Badge>
                   </div>
                   <div className="flex items-center gap-2">
                     {goal.status === "Completed" && isHR && (
                        <button 
                         onClick={() => approveGoal(goal.id)}
                         className="p-2 bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 transition-colors"
                        >
                          <CheckCircle2 className="w-5 h-5" />
                        </button>
                     )}
                     {goal.history && goal.history.length > 0 && (
                       <button 
                         onClick={() => setHistoryModalGoal(goal)}
                         className="p-2 bg-slate-900 text-white rounded-xl shadow-lg hover:bg-slate-800 transition-colors"
                       >
                         <History className="w-5 h-5" />
                       </button>
                     )}
                   </div>
                </div>
             </div>
          </Card>
        ))}
      </div>

      <AnimatePresence>
        {historyModalGoal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="w-full max-w-md"
            >
              <Card 
                title={`Progress Log: ${historyModalGoal.title}`}
                subtitle={`Employee: ${formatEmpNameById(historyModalGoal.employeeId, data.employees)}`}
              >
                <div className="max-h-[300px] overflow-y-auto pr-2 space-y-4">
                  {historyModalGoal.history && historyModalGoal.history.length > 0 ? (
                    historyModalGoal.history.map((h, index) => (
                      <div key={index} className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-black text-slate-900 bg-slate-200 px-2 py-0.5 rounded-md">
                            {h.percentage}%
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {format(new Date(h.timestamp), "MMM dd, yyyy")}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 font-medium leading-relaxed italic">
                          "{h.comment || 'No comment provided'}"
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-4 font-semibold uppercase tracking-widest">No history logs found.</p>
                  )}
                </div>
                <div className="flex justify-end mt-6">
                  <button 
                    onClick={() => setHistoryModalGoal(null)}
                    className="px-6 py-2.5 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all shadow-lg"
                  >
                    Close
                  </button>
                </div>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ComplaintsView = () => {
  const { user } = useAuth();
  const { data, updateData, createAuditLog } = useData();
  const [searchQuery, setSearchQuery] = useState("");
  const isHR = user?.role === "HR";

  const filteredComplaints = data.complaints.filter(c => {
    if (searchQuery.trim() !== "") {
      const emp = data.employees.find(e => e.id === c.employeeId);
      if (!emp) return false;
      const query = searchQuery.toLowerCase();
      const matchesName = emp.name.toLowerCase().includes(query);
      const matchesId = emp.empId ? emp.empId.toLowerCase().includes(query) : emp.id.toLowerCase().includes(query);
      return matchesName || matchesId;
    }
    return true;
  });
  const [isAdding, setIsAdding] = useState(false);
  const [nullifyingId, setNullifyingId] = useState<string | null>(null);
  const [nullifyComment, setNullifyComment] = useState("");
  const [complaint, setComplaint] = useState({ employeeId: "", title: "", description: "", type: "Behavioral" as any, penaltyPoints: 50 });

  const handleRegister = async () => {
    const newComplaint: Complaint = {
      ...complaint,
      id: `c-${Date.now()}`,
      date: new Date().toISOString(),
      status: "Registered"
    };

    const newComplaints = [...data.complaints, newComplaint];
    
    // No credits deduction on registration (only on validation/approval)
    const newEmployees = [...data.employees];
    let newMonthlyScores = [...(data.monthlyScores || [])];

    const newNotifications: Notification[] = [...data.notifications, {
      id: `n-${Date.now()}`,
      userId: newComplaint.employeeId,
      title: "Complaint Registered",
      message: `A disciplinary complaint has been registered: ${newComplaint.title}. Potential credit impact: ${newComplaint.penaltyPoints}.`,
      type: "Complaint",
      read: false,
      date: new Date().toISOString()
    }];

    await updateData({ ...data, complaints: newComplaints, employees: newEmployees, notifications: newNotifications, monthlyScores: newMonthlyScores });
    setIsAdding(false);
  };

  const validateComplaint = async (id: string) => {
    const complaint = data.complaints.find(c => c.id === id);
    if (!complaint) return;

    let actualCreditsDeducted = 0;
    let actualComplianceDeducted = 0;

    // Deduct credits and compliance on validation
    const newEmployees = data.employees.map(e => {
      if (e.id === complaint.employeeId) {
        const nextCredits = Math.max(0, e.credits - complaint.penaltyPoints);
        const nextCompliance = Math.max(0, e.compliance - 5);
        actualCreditsDeducted = e.credits - nextCredits;
        actualComplianceDeducted = e.compliance - nextCompliance;
        return { 
          ...e, 
          credits: nextCredits, 
          compliance: nextCompliance 
        };
      }
      return e;
    });

    const commentMetadata = `deducted:${actualCreditsDeducted}:${actualComplianceDeducted}`;

    // Sync with monthlyScores on validation
    const activeMonthlyCycle = data.appraisalCycles.find(c => c.type === "Monthly" && c.status === "Active");
    let newMonthlyScores = [...(data.monthlyScores || [])];
    if (activeMonthlyCycle) {
      const scoreIndex = newMonthlyScores.findIndex(ms => ms.employeeId === complaint.employeeId && ms.cycleId === activeMonthlyCycle.id);
      if (scoreIndex >= 0) {
        newMonthlyScores[scoreIndex].score -= complaint.penaltyPoints;
      } else {
        newMonthlyScores.push({
          id: `ms-${Date.now()}`,
          employeeId: complaint.employeeId,
          cycleId: activeMonthlyCycle.id,
          score: -complaint.penaltyPoints,
          month: activeMonthlyCycle.month || parseLocalDate(activeMonthlyCycle.startDate).getMonth() + 1,
          year: activeMonthlyCycle.year || parseLocalDate(activeMonthlyCycle.startDate).getFullYear()
        });
      }
    }

    const newComplaints = data.complaints.map(c => 
      c.id === id ? { ...c, status: "Validated" as const, nullificationComment: commentMetadata } : c
    );

    const log = createAuditLog("STATUS_CHANGE", id, `Validated complaint: ${complaint.title}`, user?.id);
    
    await updateData({ 
      ...data, 
      complaints: newComplaints, 
      employees: newEmployees,
      monthlyScores: newMonthlyScores,
      auditLogs: [log, ...data.auditLogs]
    });
  };

  const nullifyComplaint = async (id: string) => {
    const complaint = data.complaints.find(c => c.id === id);
    if (!complaint) return;

    const wasValidated = complaint.status === "Validated";
    let creditsToRestore = 0;
    let complianceToRestore = 0;

    if (wasValidated) {
      const meta = complaint.nullificationComment || "";
      if (meta.startsWith("deducted:")) {
        const parts = meta.split(":");
        creditsToRestore = parseInt(parts[1]) || 0;
        complianceToRestore = parseInt(parts[2]) || 0;
      } else {
        creditsToRestore = complaint.penaltyPoints;
        complianceToRestore = 5;
      }
    }

    const newEmployees = data.employees.map(e => {
      if (e.id === complaint.employeeId && wasValidated) {
        return { 
          ...e, 
          credits: Math.min(1000, e.credits + creditsToRestore), 
          compliance: Math.min(100, e.compliance + complianceToRestore) 
        };
      }
      return e;
    });

    const newComplaints = data.complaints.map(c => 
      c.id === id ? { 
        ...c, 
        status: "Dismissed" as const,
        nullificationComment: nullifyComment 
      } : c
    );

    // Sync with monthlyScores (only restore if it was previously validated/deducted)
    let newMonthlyScores = [...(data.monthlyScores || [])];
    if (wasValidated) {
      const complaintDate = parseLocalDate(complaint.date);
      const targetCycle = data.appraisalCycles.find(c => {
        if (c.type !== "Monthly") return false;
        const start = parseLocalDate(c.startDate);
        const end = parseLocalDate(c.endDate);
        return complaintDate >= start && complaintDate <= end;
      }) || data.appraisalCycles.find(c => c.type === "Monthly" && c.status === "Active");

      if (targetCycle) {
        const scoreIndex = newMonthlyScores.findIndex(ms => ms.employeeId === complaint.employeeId && ms.cycleId === targetCycle.id);
        if (scoreIndex >= 0) {
          newMonthlyScores[scoreIndex].score += complaint.penaltyPoints;
        }
      }
    }

    const log = createAuditLog("STATUS_CHANGE", id, `Nullified complaint: ${complaint.title}. Reason: ${nullifyComment}`, user?.id);
    
    const newNotifications: Notification[] = [...data.notifications, {
      id: `n-${Date.now()}`,
      userId: complaint.employeeId,
      title: "Complaint Nullified",
      message: `Disciplinary action "${complaint.title}" has been nullified. Credits restored.`,
      type: "Complaint",
      read: false,
      date: new Date().toISOString()
    }];

    await updateData({ 
      ...data, 
      complaints: newComplaints, 
      employees: newEmployees,
      notifications: newNotifications,
      auditLogs: [log, ...data.auditLogs],
      monthlyScores: newMonthlyScores
    });
    setNullifyingId(null);
    setNullifyComment("");
  };

  return (
    <div className="space-y-6">
       <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 uppercase">Compliance Registry</h1>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-1">Manual Complaint Management • {filteredComplaints.length} Shown</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input 
              type="text"
              placeholder="Search by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold uppercase tracking-widest focus:ring-2 focus:ring-rose-100 placeholder-slate-400 min-w-[200px]"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
          <button 
            onClick={() => setIsAdding(true)}
            className="px-6 py-3 bg-rose-600 text-white font-bold uppercase text-[10px] tracking-widest rounded-2xl hover:bg-rose-700 transition-all shadow-lg shadow-rose-600/20 whitespace-nowrap"
          >
            Register Complaint
          </button>
        </div>
      </header>

      {isAdding && (
        <Card title="Register New Complaint" className="mb-8 border-rose-100">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                 <label className="text-[10px] font-bold uppercase text-slate-400">Employee</label>
                 <select 
                   className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                   onChange={(e) => setComplaint({...complaint, employeeId: e.target.value})}
                 >
                   <option value="">Select Employee</option>
                   {data.employees.map(e => <option key={e.id} value={e.id}>{formatEmpName(e)}</option>)}
                 </select>
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] font-bold uppercase text-slate-400">Category</label>
                 <select 
                   className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                   onChange={(e) => setComplaint({...complaint, type: e.target.value as any})}
                 >
                   <option value="Behavioral">Behavioral</option>
                   <option value="Timesheet">Timesheet</option>
                   <option value="Deadline">Deadline</option>
                   <option value="Leave">Leave</option>
                 </select>
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] font-bold uppercase text-slate-400">Penalty Weightage (Credits)</label>
                 <input 
                   type="number"
                   className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                   value={complaint.penaltyPoints}
                   onChange={(e) => setComplaint({...complaint, penaltyPoints: parseInt(e.target.value) || 0})}
                 />
              </div>
              <div className="col-span-full space-y-2">
                 <label className="text-[10px] font-bold uppercase text-slate-400">Description</label>
                 <textarea 
                   className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                   rows={3}
                   onChange={(e) => setComplaint({...complaint, title: e.target.value, description: e.target.value})}
                 />
              </div>
           </div>
           <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setIsAdding(false)} className="px-6 py-2 text-[10px] font-bold uppercase text-slate-500">Cancel</button>
              <button onClick={handleRegister} className="px-6 py-2 bg-rose-600 text-white text-[10px] font-bold uppercase rounded-xl">Register Action</button>
           </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredComplaints.map(c => (
          <Card key={c.id} className="border-l-4 border-rose-500">
             <div className="flex justify-between items-start mb-4">
               <Badge variant="danger">{c.type}</Badge>
               <span className="text-[10px] font-bold text-slate-400 font-mono">{format(new Date(c.date), "MMM dd, yyyy")}</span>
             </div>
             <p className="text-sm font-bold text-slate-900 mb-2">{formatEmpNameById(c.employeeId, data.employees)}</p>
             <p className="text-xs text-slate-600 mb-4">{c.description}</p>
             <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                <span className="text-[10px] font-black uppercase text-rose-600 tracking-widest">Penalty: -{c.penaltyPoints} Credits</span>
                <div className="flex items-center gap-2">
                   <Badge variant={c.status === "Validated" ? "success" : c.status === "Registered" ? "warning" : "default"}>{c.status}</Badge>
                   {isHR && (c.status === "Registered" || c.status === "Validated") && (
                      <div className="flex gap-1">
                        {c.status === "Registered" && (
                          <button 
                             onClick={() => validateComplaint(c.id)}
                             className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                             title="Validate Complaint"
                          >
                             <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button 
                           onClick={() => setNullifyingId(c.id)}
                           className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-colors"
                           title="Nullify/Revert"
                        >
                           <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                </div>
             </div>

             {nullifyingId === c.id && (
               <div className="mt-4 p-4 bg-rose-50 border border-rose-100 rounded-2xl animate-in slide-in-from-top-2">
                 <p className="text-[10px] font-black uppercase text-rose-600 mb-2">Nullification Reason</p>
                 <textarea 
                   className="w-full p-3 bg-white border border-rose-200 rounded-xl text-xs mb-3"
                   placeholder="Provide comment for reverting this action..."
                   rows={2}
                   value={nullifyComment}
                   onChange={(e) => setNullifyComment(e.target.value)}
                 />
                 <div className="flex justify-end gap-2">
                   <button onClick={() => setNullifyingId(null)} className="px-3 py-1.5 text-[9px] font-bold uppercase text-slate-400">Cancel</button>
                   <button 
                     onClick={() => nullifyComplaint(c.id)} 
                     disabled={!nullifyComment.trim()}
                     className="px-4 py-1.5 bg-rose-600 text-white text-[9px] font-bold uppercase rounded-lg disabled:opacity-50"
                   >
                     Revert Action
                   </button>
                 </div>
               </div>
             )}

             {c.status === "Dismissed" && c.nullificationComment && (
               <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                 <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Nullification Note</p>
                 <p className="text-[11px] text-slate-600 italic">"{c.nullificationComment}"</p>
               </div>
             )}
          </Card>
        ))}
      </div>
    </div>
  );
};

const CycleManagementView = ({ onBack }: { onBack: () => void }) => {
  const { data, updateData, createAuditLog, showToast } = useData();
  const { user } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCycle, setNewCycle] = useState<Partial<AppraisalCycle>>({
    type: "Monthly",
    name: "",
    status: "Drafted",
    startDate: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    endDate: format(endOfMonth(new Date()), "yyyy-MM-dd"),
  });

  const handleCreateCycle = async () => {
    if (!newCycle.name) {
      showToast("Please enter a cycle name.", "error");
      return;
    }
    if (!newCycle.startDate || !newCycle.endDate) {
      showToast("Please select start and end dates.", "error");
      return;
    }

    try {
      const startDateObj = parseLocalDate(newCycle.startDate as string);
      const startYear = startDateObj.getFullYear();
      const startMonth = startDateObj.getMonth() + 1;
      
      let cycleYear = startYear;
      if (newCycle.type === "Monthly" || newCycle.type === "Yearly") {
        cycleYear = startMonth < 7 ? startYear : startYear + 1;
      }

      const cycle: AppraisalCycle = {
        id: `cycle-${Date.now()}`,
        name: newCycle.name as string,
        type: (newCycle.type as any) || "Monthly",
        status: "Drafted",
        startDate: newCycle.startDate as string,
        endDate: newCycle.endDate as string,
        year: cycleYear,
        month: newCycle.type === "Monthly" ? startMonth : undefined
      };

      const log = createAuditLog("CREATE", cycle.id, `Created ${cycle.type} cycle: ${cycle.name}`, user?.id);
      
      const updatedCycles = [cycle, ...(data.appraisalCycles || [])];
      await updateData({
        ...data,
        appraisalCycles: updatedCycles,
        auditLogs: [log, ...(data.auditLogs || [])]
      });
      
      setShowCreateModal(false);
      setNewCycle({ name: "", type: "Monthly", startDate: "", endDate: "" });
    } catch (error) {
      console.error("Cycle creation failed:", error);
    }
  };

  const updateCycleStatus = async (id: string, status: AppraisalCycle["status"]) => {
    const currentCycles = data.appraisalCycles || [];
    const newCycles = currentCycles.map(c => {
      // If activating a cycle, deactivate other active cycles of the same type
      if (status === "Active" && c.type === currentCycles.find(x => x.id === id)?.type && c.id !== id && c.status === "Active") {
          return { ...c, status: "Completed" as any };
      }
      return c.id === id ? { ...c, status } : c;
    });

    try {
      const log = createAuditLog("STATUS_CHANGE", id, `Cycle status updated to ${status}`, user?.id);
      await updateData({
        ...data,
        appraisalCycles: newCycles,
        auditLogs: [log, ...(data.auditLogs || [])]
      });
    } catch (error) {
      console.error("Failed to update cycle status:", error);
    }
  };

  const deleteCycle = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this appraisal cycle?")) return;
    
    try {
      const currentCycles = data.appraisalCycles || [];
      const newCycles = currentCycles.filter(c => c.id !== id);
      const log = createAuditLog("EDIT", id, `Deleted cycle ${id}`, user?.id);
      
      await updateData({ 
        ...data, 
        appraisalCycles: newCycles,
        auditLogs: [log, ...(data.auditLogs || [])]
      });
    } catch (error) {
      console.error("Failed to delete cycle:", error);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" /> Dashboard
        </button>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl"
        >
          Initialize New Cycle
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.appraisalCycles.map(cycle => (
          <Card key={cycle.id} className="relative group">
            <div className="flex justify-between items-start mb-6">
               <Badge variant={
                 cycle.status === "Active" ? "success" : 
                 cycle.status === "Completed" ? "default" : 
                 cycle.status === "Archived" ? "default" : "warning"
               }>
                 {cycle.status}
               </Badge>
               <div className="flex gap-2">
                 {cycle.status === "Drafted" && (
                   <button onClick={() => updateCycleStatus(cycle.id, "Active")} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100"><Play className="w-4 h-4" /></button>
                 )}
                 {cycle.status === "Active" && (
                   <button onClick={() => updateCycleStatus(cycle.id, "Completed")} className="p-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200"><XCircle className="w-4 h-4" /></button>
                 )}
                 <button 
                   onClick={() => deleteCycle(cycle.id)} 
                   disabled={cycle.status !== "Drafted"}
                   className={cn(
                     "p-2 rounded-xl transition-colors",
                     cycle.status === "Completed" ? "bg-slate-50 text-slate-300 cursor-not-allowed" : "bg-rose-50 text-rose-600 hover:bg-rose-100"
                   )}
                 >
                   <Trash2 className="w-4 h-4" />
                 </button>
               </div>
            </div>
            <h4 className="text-sm font-black text-slate-900 mb-2">{cycle.name}</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">{cycle.type} Strategy</p>
            <div className="pt-4 border-t border-slate-100 space-y-2">
               <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
                 <span>Start</span>
                 <span className="text-slate-900">{format(parseLocalDate(cycle.startDate), "MMM dd, yyyy")}</span>
               </div>
               <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
                 <span>End</span>
                 <span className="text-slate-900">{format(parseLocalDate(cycle.endDate), "MMM dd, yyyy")}</span>
               </div>
            </div>
          </Card>
        ))}
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md">
              <Card title="Initialize Appraisal Cycle">
                <div className="space-y-6">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setNewCycle({...newCycle, type: "Monthly"})} 
                      className={cn("flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", newCycle.type === "Monthly" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400")}
                    >Monthly</button>
                    <button 
                      onClick={() => setNewCycle({...newCycle, type: "Yearly"})} 
                      className={cn("flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", newCycle.type === "Yearly" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400")}
                    >Yearly</button>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cycle Name</label>
                    <input 
                      type="text" 
                      value={newCycle.name} 
                      onChange={e => setNewCycle({...newCycle, name: e.target.value})}
                      placeholder="e.g. Q3 Performance Review"
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Start Date</label>
                      <input 
                        type="date" 
                        value={newCycle.startDate} 
                        onChange={e => setNewCycle({...newCycle, startDate: e.target.value})}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">End Date</label>
                      <input 
                        type="date" 
                        value={newCycle.endDate} 
                        onChange={e => setNewCycle({...newCycle, endDate: e.target.value})}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold"
                      />
                    </div>
                  </div>
                  <div className="flex gap-4 pt-4">
                    <button onClick={() => setShowCreateModal(false)} className="flex-1 py-4 text-[10px] font-black uppercase text-slate-400">Cancel</button>
                    <button 
                      onClick={handleCreateCycle} 
                      disabled={!newCycle.name || !newCycle.startDate || !newCycle.endDate}
                      className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase shadow-xl disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                      Create Cycle
                    </button>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const CalendarActivityView = ({ events, startDate, endDate }: { events: any[], startDate: Date | string, endDate: Date | string }) => {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  
  const days: Date[] = [];
  let curr = new Date(start);
  // Ensure we don't end up in an infinite loop if dates are weird
  const limit = 400; 
  let count = 0;
  while (curr <= end && count < limit) {
    days.push(new Date(curr));
    curr.setDate(curr.getDate() + 1);
    count++;
  }

  const startDayOfWeek = start.getDay(); // 0 for Sunday, 1 for Monday, etc.

  return (
    <div className="grid grid-cols-7 gap-2">
      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
        <div key={`${d}-${i}`} className="text-center text-[9px] font-black text-slate-400 mb-2">{d}</div>
      ))}
      {Array.from({ length: startDayOfWeek }).map((_, i) => (
        <div key={`empty-${i}`} className="aspect-square" />
      ))}
      {days.map((day, i) => {
        const dayEvents = events.filter(e => {
            const evDate = parseLocalDate(e.date);
            return evDate.getDate() === day.getDate() && evDate.getMonth() === day.getMonth() && evDate.getFullYear() === day.getFullYear();
        });
        const hasPositive = dayEvents.some(e => e.impact > 0);
        const hasNegative = dayEvents.some(e => e.impact < 0);
        const totalImpact = dayEvents.reduce((acc, current) => acc + current.impact, 0);

        return (
          <div key={i} className={cn(
            "aspect-square rounded-lg flex flex-col items-center justify-center relative border border-slate-100",
            dayEvents.length > 0 ? "bg-slate-50 shadow-sm" : "bg-white"
          )}>
            <span className="text-[9px] font-bold text-slate-400">{day.getDate()}</span>
            <div className="flex gap-0.5 mt-1">
               {hasPositive && <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_5px_rgba(16,185,129,0.5)]" />}
               {hasNegative && <div className="w-1.5 h-1.5 bg-rose-500 rounded-full shadow-[0_0_5px_rgba(244,63,94,0.5)]" />}
            </div>
            {dayEvents.length > 0 && (
              <div className="absolute inset-x-0 bottom-full mb-2 opacity-0 hover:opacity-100 bg-slate-900 text-white p-3 rounded-xl z-50 cursor-default transition-all duration-200 shadow-2xl min-w-[200px] pointer-events-none">
                <div className="flex justify-between items-center mb-2 pb-2 border-b border-white/10">
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">{format(day, "EEEE, MMM dd")}</p>
                  <span className={cn("text-[10px] font-black", totalImpact >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {totalImpact >= 0 ? "+" : ""}{totalImpact} pts
                  </span>
                </div>
                <div className="space-y-2">
                  {dayEvents.map((e, idx) => (
                    <div key={idx} className="flex justify-between items-start gap-4">
                      <p className="text-[9px] font-medium leading-tight">• {e.title}</p>
                      <span className={cn("text-[8px] font-bold whitespace-nowrap", e.impact > 0 ? "text-emerald-400" : "text-rose-400")}>
                        {e.impact > 0 ? "+" : ""}{e.impact}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {dayEvents.length > 0 && (
               <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse md:hidden" />
            )}
          </div>
        )
      })}
    </div>
  )
}

const MonthlyAppraisalDetails = ({ onBack, onSelectEmployee, cycleId }: { onBack: () => void; onSelectEmployee: (id: string) => void; cycleId?: string }) => {
  const { data } = useData();
  const [searchQuery, setSearchQuery] = useState("");
  const [designationFilter, setDesignationFilter] = useState("All Designations");
  const [eventTypeFilter, setEventTypeFilter] = useState("All Events");

  // Track the selected cycle ID in state to allow switching inside Monthly view
  const [currentCycleId, setCurrentCycleId] = useState(cycleId);

  useEffect(() => {
    setCurrentCycleId(cycleId);
  }, [cycleId]);

  // Historical Month Navigation
  const [viewDate, setViewDate] = useState(new Date());
  
  const cycle = data.appraisalCycles.find(c => c.id === currentCycleId);
  const cycleStart = cycle ? parseLocalDate(cycle.startDate) : startOfMonth(viewDate);
  const cycleEnd = cycle ? parseLocalDate(cycle.endDate) : endOfMonth(viewDate);

  const designations = ["All Designations", ...Array.from(new Set(data.employees.map(e => e.department)))];
  const eventTypes = ["All Events", "goal", "submission", "achievement", "merit", "complaint"];
  
  const filteredEmployees = [...data.employees]
    .filter(e => {
      const matchesSearch = e.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           e.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           e.department.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDesignation = designationFilter === "All Designations" || e.department === designationFilter;
      return matchesSearch && matchesDesignation;
    })
    .sort((a, b) => b.credits - a.credits);
    
  const [selectedEmpForCalendar, setSelectedEmpForCalendar] = useState<string | null>(null);

  // Snapshot Data Calculations
  const employeesInTeam = data.employees.filter(e => designationFilter === "All Designations" || e.department === designationFilter);
  const allEventsInCycle = employeesInTeam.flatMap(emp => getPerformanceEvents(data, emp.id, cycleStart, cycleEnd));
  const totalGoals = allEventsInCycle.filter(e => e.type === 'goal').length;
  const totalSubmissions = allEventsInCycle.filter(e => e.type === 'submission').length;
  const totalCredits = allEventsInCycle.filter(e => e.impact > 0).reduce((acc, e) => acc + e.impact, 0);
  const totalDemerits = allEventsInCycle.filter(e => e.impact < 0).reduce((acc, e) => acc + Math.abs(e.impact), 0);
  const totalComplaints = allEventsInCycle.filter(e => e.type === 'complaint').length;
  
  const avgCompletion = employeesInTeam.length > 0 
    ? (totalGoals / employeesInTeam.length * 10).toFixed(1) 
    : "0";

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <button onClick={onBack} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" /> Dashboard
        </button>
        
        <div className="flex flex-1 max-w-xl w-full gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Search employees..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-100 transition-all shadow-sm"
            />
          </div>
          <select 
            value={designationFilter}
            onChange={(e) => setDesignationFilter(e.target.value)}
            className="px-4 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
          >
            {designations.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="text-right">
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Monthly Appraisal Cycle</h2>
          <div className="flex items-center justify-end gap-3 mt-1">
            <div className="flex items-center bg-slate-100 rounded-xl p-1.5 relative pr-6">
              <select
                value={currentCycleId || ""}
                onChange={(e) => setCurrentCycleId(e.target.value)}
                className="bg-transparent text-[10px] font-black uppercase tracking-widest text-indigo-600 border-none outline-none cursor-pointer appearance-none font-sans"
              >
                {data.appraisalCycles
                  .filter(c => c.type === "Monthly" && (c.status === "Active" || c.status === "Completed" || c.status === "Archived"))
                  .map(c => (
                    <option key={c.id} value={c.id} className="text-slate-900 font-bold text-xs">{c.name}</option>
                  ))
                }
              </select>
              <ChevronRight className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-indigo-600 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Snapshot Data */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {[
          { label: "Goals Completed", value: totalGoals, icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50" },
          { label: "Completion Rate", value: `${avgCompletion}%`, icon: TrendingUp, color: "text-indigo-500", bg: "bg-indigo-50" },
          { label: "Credits Awarded", value: totalCredits, icon: Zap, color: "text-amber-500", bg: "bg-amber-50" },
          { label: "Demerit Points", value: totalDemerits, icon: XCircle, color: "text-rose-600", bg: "bg-rose-50" },
          { label: "Compliance Issues", value: totalComplaints, icon: AlertCircle, color: "text-rose-500", bg: "bg-rose-50" }
        ].map((stat, i) => (
          <Card key={i} className="p-6 border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center mb-4", stat.bg)}>
              <stat.icon className={cn("w-5 h-5", stat.color)} />
            </div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
            <h4 className="text-xl font-black text-slate-900 tracking-tight">{stat.value}</h4>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8 space-y-6">
           <Card className="p-0 overflow-hidden" title="Workforce Monthly Status">
              <div className="overflow-x-auto">
                 <table className="w-full text-left">
                   <thead className="bg-slate-50 border-b border-slate-100">
                     <tr>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Employee</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Team Progress</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Monthly Score</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Actions</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                      {filteredEmployees.map(emp => {
                        const events = getPerformanceEvents(data, emp.id, cycleStart, cycleEnd);
                        const taskCount = events.filter(e => e.type === 'goal' || e.type === 'submission').length;
                        const cycleScore = data.monthlyScores?.find(ms => ms.employeeId === emp.id && ms.cycleId === (cycle?.id || ""))?.score;
                        const score = (cycleScore !== undefined && cycle?.status !== "Active") ? cycleScore : events.reduce((acc, e) => acc + e.impact, 0);

                        return (
                          <tr key={emp.id} className={cn("hover:bg-slate-50 transition-colors group", selectedEmpForCalendar === emp.id ? "bg-indigo-50/50" : "")}>
                             <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-900 font-bold text-xs">
                                    {getInitials(emp.name)}
                                  </div>
                                  <div>
                                    <p className="text-xs font-black text-slate-900">{formatEmpName(emp)}</p>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{emp.role}</p>
                                  </div>
                                </div>
                             </td>
                             <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, (taskCount / 10) * 100)}%` }} />
                                  </div>
                                  <span className="text-[10px] font-black text-slate-900">{taskCount}</span>
                                </div>
                             </td>
                             <td className="px-6 py-4">
                                <span className={cn("text-xs font-black", score >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                  {score > 0 ? "+" : ""}{score} pts
                                </span>
                             </td>
                             <td className="px-6 py-4">
                                <div className="flex gap-2">
                                  <button 
                                    onClick={() => setSelectedEmpForCalendar(selectedEmpForCalendar === emp.id ? null : emp.id)}
                                    className={cn("p-2 rounded-xl transition-all", selectedEmpForCalendar === emp.id ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
                                  >
                                    <Calendar className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => onSelectEmployee(emp.id)}
                                    className="p-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200"
                                  >
                                    <ChevronRight className="w-4 h-4" />
                                  </button>
                                </div>
                             </td>
                          </tr>
                        );
                      })}
                   </tbody>
                 </table>
              </div>
           </Card>
        </div>

        <div className="col-span-12 lg:col-span-4 space-y-6">
           {selectedEmpForCalendar ? (
             <Card title={`Monthly Activity: ${formatEmpNameById(selectedEmpForCalendar, data.employees)}`}>
                <div className="mb-4">
                  <select 
                    value={eventTypeFilter}
                    onChange={(e) => setEventTypeFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none"
                  >
                    {eventTypes.map(t => <option key={t} value={t}>{t === "All Events" ? "All Event Types" : t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <CalendarActivityView 
                  events={getPerformanceEvents(data, selectedEmpForCalendar, cycleStart, cycleEnd).filter(e => eventTypeFilter === "All Events" || e.type === eventTypeFilter)} 
                  startDate={cycleStart} 
                  endDate={cycleEnd} 
                />
             </Card>
           ) : (
             <div className="h-full min-h-[400px] flex flex-col items-center justify-center p-12 text-center bg-white rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                  <Users className="w-8 h-8 text-slate-200" />
                </div>
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-tighter mb-2">Activity Insights</h4>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-relaxed max-w-[200px]">
                  Select an employee from the table to preview their professional activity timeline for this appraisal cycle.
                </p>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

const YearlyAppraisalDetails = ({ onBack, onSelectEmployee, cycleId }: { onBack: () => void; onSelectEmployee: (id: string) => void; cycleId?: string }) => {
  const { data } = useData();
  const [searchQuery, setSearchQuery] = useState("");
  const [designationFilter, setDesignationFilter] = useState("All Designations");
  const [currentCycleId, setCurrentCycleId] = useState(cycleId);

  useEffect(() => {
    setCurrentCycleId(cycleId);
  }, [cycleId]);

  const cycle = data.appraisalCycles.find(c => c.id === currentCycleId);

  const cycleStart = cycle ? parseLocalDate(cycle.startDate) : new Date(new Date().getFullYear(), 6, 1);
  const cycleEnd = cycle ? parseLocalDate(cycle.endDate) : new Date(new Date().getFullYear() + 1, 5, 30);

  const designations = ["All Designations", ...Array.from(new Set(data.employees.map(e => e.department)))];

  const employees = [...data.employees]
    .filter(e => {
      const matchesSearch = e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           e.role.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDesignation = designationFilter === "All Designations" || e.department === designationFilter;
      return matchesSearch && matchesDesignation;
    })
    .sort((a, b) => b.credits - a.credits);

  // Snapshot Data Calculations for Yearly Cycle
  const employeesInTeam = data.employees.filter(e => designationFilter === "All Designations" || e.department === designationFilter);
  const allEventsInYear = employeesInTeam.flatMap(emp => getPerformanceEvents(data, emp.id, cycleStart, cycleEnd));
  const totalGoals = allEventsInYear.filter(e => e.type === 'goal').length;
  const totalCredits = allEventsInYear.filter(e => e.impact > 0).reduce((acc, e) => acc + e.impact, 0);
  const totalDemerits = allEventsInYear.filter(e => e.impact < 0).reduce((acc, e) => acc + Math.abs(e.impact), 0);
  const totalComplaints = allEventsInYear.filter(e => e.type === 'complaint').length;

  const avgCompletion = employeesInTeam.length > 0 
    ? (totalGoals / employeesInTeam.length * 10).toFixed(1) 
    : "0";

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <button onClick={onBack} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" /> Dashboard
        </button>

        <div className="flex flex-1 max-w-xl w-full gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search candidates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-100 transition-all shadow-sm"
            />
          </div>
          <select 
            value={designationFilter}
            onChange={(e) => setDesignationFilter(e.target.value)}
            className="px-4 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
          >
            {designations.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="text-right">
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Yearly Appraisal Cycle</h2>
          <div className="flex items-center justify-end gap-3 mt-1">
            <div className="flex items-center bg-slate-100 rounded-xl p-1.5 relative pr-6">
              <select
                value={currentCycleId || ""}
                onChange={(e) => setCurrentCycleId(e.target.value)}
                className="bg-transparent text-[10px] font-black uppercase tracking-widest text-indigo-600 border-none outline-none cursor-pointer appearance-none font-sans"
              >
                {data.appraisalCycles
                  .filter(c => c.type === "Yearly")
                  .map(c => (
                    <option key={c.id} value={c.id} className="text-slate-900 font-bold text-xs">{c.name}</option>
                  ))
                }
              </select>
              <ChevronRight className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-indigo-600 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Snapshot Data for Yearly View */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {[
          { label: "Goals Completed", value: totalGoals, icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50" },
          { label: "Completion Rate", value: `${avgCompletion}%`, icon: TrendingUp, color: "text-indigo-500", bg: "bg-indigo-50" },
          { label: "Credits Awarded", value: totalCredits, icon: Zap, color: "text-amber-500", bg: "bg-amber-50" },
          { label: "Demerit Points", value: totalDemerits, icon: XCircle, color: "text-rose-600", bg: "bg-rose-50" },
          { label: "Compliance Issues", value: totalComplaints, icon: AlertCircle, color: "text-rose-500", bg: "bg-rose-50" }
        ].map((stat, i) => (
          <Card key={i} className="p-6 border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center mb-4", stat.bg)}>
              <stat.icon className={cn("w-5 h-5", stat.color)} />
            </div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
            <h4 className="text-xl font-black text-slate-900 tracking-tight">{stat.value}</h4>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-8">
         <div className="col-span-12 space-y-8">
            <Card className="p-0 overflow-hidden" title="Comparative Performance">
              <div className="overflow-x-auto">
                 <table className="w-full text-left">
                   <thead className="bg-slate-50 border-b border-slate-100">
                     <tr>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Employee</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Total Points</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Avg Monthly Score</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Goals Done</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Consistency</th>
                        <th className="px-6 py-4"></th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                      {employees.map(emp => {
                        const yearlyEvents = getPerformanceEvents(data, emp.id, cycleStart, cycleEnd);
                        const totalYearlyPoints = yearlyEvents.reduce((acc, e) => acc + e.impact, 0);

                        const yearlyCycles = data.appraisalCycles.filter(c => c.type === "Monthly" && parseLocalDate(c.startDate) >= cycleStart && parseLocalDate(c.endDate) <= cycleEnd);
                        const yearlyCycleIds = yearlyCycles.map(c => c.id);
                        const empScores = data.monthlyScores.filter(ms => ms.employeeId === emp.id && yearlyCycleIds.includes(ms.cycleId));
                        
                        const monthlyAverages = yearlyCycles.map(c => {
                          const mEvents = getPerformanceEvents(data, emp.id, parseLocalDate(c.startDate), parseLocalDate(c.endDate));
                          return mEvents.reduce((acc, e) => acc + e.impact, 0);
                        });
                        const activeMonthsWithEvents = monthlyAverages.filter(score => score > 0);
                        const fallbackAvg = activeMonthsWithEvents.length > 0 
                          ? Math.round(activeMonthsWithEvents.reduce((acc, s) => acc + s, 0) / activeMonthsWithEvents.length)
                          : 0;

                        const avgMonthlyScore = empScores.length > 0
                          ? Math.round(empScores.reduce((acc, s) => acc + s.score, 0) / empScores.length)
                          : fallbackAvg;

                        const completedGoalsCount = data.goals.filter(g => {
                          if (g.employeeId !== emp.id) return false;
                          if (g.status !== "Completed" && g.status !== "Approved") return false;
                          const date = g.submissionDate ? parseLocalDate(g.submissionDate) : null;
                          if (!date) return true;
                          return date >= cycleStart && date <= cycleEnd;
                        }).length;

                        return (
                          <tr key={emp.id} className="hover:bg-slate-50 group transition-colors">
                             <td className="px-6 py-4">
                                <p className="text-xs font-black text-slate-900">{formatEmpName(emp)}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{emp.role}</p>
                             </td>
                             <td className="px-6 py-4 text-xs font-black text-slate-900">
                                {totalYearlyPoints}
                             </td>
                             <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                   <span className="text-xs font-black text-slate-900">{avgMonthlyScore}</span>
                                   <span className="text-[9px] font-bold text-emerald-500">↑ 12%</span>
                                </div>
                             </td>
                             <td className="px-6 py-4 text-xs font-bold text-slate-600">
                                {completedGoalsCount}
                             </td>
                             <td className="px-6 py-4">
                                <div className="flex gap-1">
                                   {[1,2,3,4,5].map(j => (
                                     <div key={j} className={cn("w-1.5 h-1.5 rounded-full", j <= 4 ? "bg-emerald-400" : "bg-slate-200")} />
                                   ))}
                                </div>
                             </td>
                             <td className="px-6 py-4 text-right">
                                <button
                                  onClick={() => onSelectEmployee(emp.id)}
                                  className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                >
                                   <ChevronRight className="w-4 h-4" />
                                </button>
                             </td>
                          </tr>
                        );
                      })}
                   </tbody>
                 </table>
              </div>
           </Card>
        </div>
      </div>
    </div>
  );
};

const EmployeeDrillDownView = ({ empId, cycle }: { empId: string; cycle: any }) => {
  const { data, updateData, createAuditLog } = useData();
  const { user: currentUser } = useAuth();
  const emp = data.employees.find(e => e.id === empId);
  const [showAdjustmentForm, setShowAdjustmentForm] = useState(false);
  const [adjustment, setAdjustment] = useState({ type: "Credit" as "Credit" | "Penalty", amount: 10, reason: "" });

  const dbCycle = data.appraisalCycles.find(c => c.id === cycle.id);
  const isYearly = dbCycle?.type === "Yearly";
  
  const cycleStart = parseLocalDate(cycle.start);
  const cycleEnd = parseLocalDate(cycle.end);
  
  const months: Date[] = [];
  if (isYearly) {
    let currentMonth = new Date(cycleStart.getFullYear(), cycleStart.getMonth(), 1);
    const endMonth = new Date(cycleEnd.getFullYear(), cycleEnd.getMonth(), 1);
    let iterations = 0;
    while (currentMonth <= endMonth && iterations < 24) {
      months.push(new Date(currentMonth));
      currentMonth.setMonth(currentMonth.getMonth() + 1);
      iterations++;
    }
  }

  const [selectedCalendarMonth, setSelectedCalendarMonth] = useState<Date | null>(() => {
    if (!isYearly) return null;
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const inRange = currentMonthStart >= new Date(cycleStart.getFullYear(), cycleStart.getMonth(), 1) &&
                    currentMonthStart <= new Date(cycleEnd.getFullYear(), cycleEnd.getMonth(), 1);
    return inRange ? currentMonthStart : new Date(cycleStart);
  });

  useEffect(() => {
    if (isYearly) {
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const inRange = currentMonthStart >= new Date(cycleStart.getFullYear(), cycleStart.getMonth(), 1) &&
                      currentMonthStart <= new Date(cycleEnd.getFullYear(), cycleEnd.getMonth(), 1);
      setSelectedCalendarMonth(inRange ? currentMonthStart : new Date(cycleStart));
    } else {
      setSelectedCalendarMonth(null);
    }
  }, [cycle.id, cycle.start, cycle.end, isYearly]);

  const calStart = (isYearly && selectedCalendarMonth) ? startOfMonth(selectedCalendarMonth) : cycleStart;
  const calEnd = (isYearly && selectedCalendarMonth) ? endOfMonth(selectedCalendarMonth) : cycleEnd;

  if (!emp) return null;

  const events = getPerformanceEvents(data, empId, cycleStart, cycleEnd);
  const stats = {
     completedTasks: events.filter(e => e.type === 'goal' || e.type === 'submission').length,
     totalImpact: events.reduce((acc, e) => acc + e.impact, 0),
     positiveEvents: events.filter(e => e.impact > 0).length,
     penaltyEvents: events.filter(e => e.impact < 0).length
  };

  const handleManualAdjustment = async () => {
    if (!adjustment.reason) return;
    
    const adjDate = cycle.status === "Active" ? new Date().toISOString() : new Date(cycle.end).toISOString();
    
    const adj: ManualAdjustment = {
      id: `adj-${Date.now()}`,
      employeeId: empId,
      type: adjustment.type,
      amount: adjustment.amount,
      reason: adjustment.reason,
      actorId: currentUser?.id || "admin",
      date: adjDate
    };

    const nextCredits = adjustment.type === "Credit" 
      ? Math.min(1000, emp.credits + adjustment.amount)
      : Math.max(0, emp.credits - adjustment.amount);

    const newEmployees = data.employees.map(e => e.id === empId ? { ...e, credits: nextCredits } : e);
    const newAdjustments = [adj, ...(data.manualAdjustments || [])];
    const log = createAuditLog("EDIT", empId, `Manual ${adjustment.type} of ${adjustment.amount} added: ${adjustment.reason}`, currentUser?.id);

    // Update monthly scores (Automatic Point Posting)
    let newMonthlyScores = [...(data.monthlyScores || [])];
    const targetCycleId = cycle.id || data.appraisalCycles.find(c => c.type === "Monthly" && c.status === "Active")?.id;
    if (targetCycleId) {
      const scoreIndex = newMonthlyScores.findIndex(ms => ms.employeeId === empId && ms.cycleId === targetCycleId);
      const impact = adjustment.type === "Credit" ? adjustment.amount : -adjustment.amount;
      if (scoreIndex >= 0) {
        newMonthlyScores[scoreIndex].score += impact;
      } else {
        newMonthlyScores.push({
          id: `ms-${Date.now()}`,
          employeeId: empId,
          cycleId: targetCycleId,
          score: impact,
          month: cycle.month || parseLocalDate(cycle.start).getMonth() + 1,
          year: cycle.year || parseLocalDate(cycle.start).getFullYear()
        });
      }
    }

    await updateData({
      ...data,
      employees: newEmployees,
      manualAdjustments: newAdjustments,
      monthlyScores: newMonthlyScores,
      auditLogs: [log, ...data.auditLogs]
    });

    setShowAdjustmentForm(false);
    setAdjustment({ type: "Credit", amount: 10, reason: "" });
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-right duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 bg-slate-900 rounded-2xl flex items-center justify-center text-white text-3xl font-black shadow-2xl">
            {getInitials(emp.name)}
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">{formatEmpName(emp)}</h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{emp.role} • {emp.department}</p>
            <div className="flex gap-2 mt-4">
              <Badge variant="success">{emp.credits} Credits</Badge>
              <Badge variant="warning">{emp.compliance}% Compliance</Badge>
            </div>
          </div>
        </div>
        {currentUser?.role === "HR" && (
          <button 
            onClick={() => setShowAdjustmentForm(true)}
            className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:shadow-xl transition-all"
          >
            <Plus className="w-4 h-4" /> Manual Adjustment
          </button>
        )}
      </div>

      <div className="grid grid-cols-12 gap-6">
         <Card className="col-span-12 lg:col-span-3 bg-indigo-50 border-indigo-100" title="Cycle Summary">
            <div className="space-y-4">
               <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tasks Done</span>
                  <span className="text-xl font-black text-indigo-900">{stats.completedTasks}</span>
               </div>
               <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Points</span>
                  <span className={cn("text-xl font-black", stats.totalImpact >= 0 ? "text-emerald-600" : "text-rose-600")}>
                    {stats.totalImpact > 0 ? "+" : ""}{stats.totalImpact}
                  </span>
               </div>
               <div className="pt-2 border-t border-indigo-200/50 grid grid-cols-2 gap-2">
                  <div className="text-center p-2 bg-white rounded-xl shadow-sm">
                    <p className="text-[8px] font-bold text-slate-400 uppercase">Merits</p>
                    <p className="text-xs font-black text-emerald-500">{stats.positiveEvents}</p>
                  </div>
                  <div className="text-center p-2 bg-white rounded-xl shadow-sm">
                    <p className="text-[8px] font-bold text-slate-400 uppercase">Demerits</p>
                    <p className="text-xs font-black text-rose-500">{stats.penaltyEvents}</p>
                  </div>
               </div>
            </div>
         </Card>

         <div className="col-span-12 lg:col-span-9 grid grid-cols-12 gap-8">
            <Card className="col-span-12 lg:col-span-7">
               <div className="flex justify-between items-center mb-6 pb-2 border-b border-slate-100">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Historical Calendar View</h3>
                  {isYearly && selectedCalendarMonth && (
                    <div className="flex items-center bg-slate-100 rounded-xl p-1.5 relative pr-6">
                      <select
                        value={selectedCalendarMonth.toISOString()}
                        onChange={(e) => setSelectedCalendarMonth(new Date(e.target.value))}
                        className="bg-transparent text-[10px] font-black uppercase tracking-widest text-indigo-600 border-none outline-none cursor-pointer appearance-none font-sans"
                      >
                        {months.map((m, idx) => (
                          <option key={idx} value={m.toISOString()} className="text-slate-900 font-bold text-xs">
                            {format(m, "MMMM yyyy")}
                          </option>
                        ))}
                      </select>
                      <ChevronRight className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-indigo-600 pointer-events-none" />
                    </div>
                  )}
               </div>
               <CalendarActivityView events={events} startDate={calStart} endDate={calEnd} />
               <div className="mt-8 flex gap-6 text-[9px] font-bold uppercase tracking-widest text-slate-400 border-t border-slate-50 pt-4">
                  <div className="flex items-center gap-2"><div className="w-2 h-2 bg-emerald-500 rounded-full" /> Positive Impact</div>
                  <div className="flex items-center gap-2"><div className="w-2 h-2 bg-rose-500 rounded-full" /> Infraction / Penalty</div>
                  <div className="flex items-center gap-2"><div className="w-2 h-2 bg-slate-200 rounded-full" /> No Activity</div>
               </div>
            </Card>

            {/* Detailed Timeline */}
            <Card title="Event Feed" className="col-span-12 lg:col-span-5 h-[500px] overflow-y-auto custom-scrollbar">
               <div className="relative pl-8 border-l-2 border-slate-100 space-y-8 py-4">
                  {events.length === 0 ? (
                    <div className="py-20 text-center opacity-30">
                      <p className="text-xs font-black uppercase tracking-widest">No activity recorded for this period</p>
                    </div>
                  ) : (
                    events.map((ev, i) => (
                      <div key={i} className="relative">
                        <div className={cn(
                          "absolute -left-[41px] w-4 h-4 rounded-full border-4 border-white shadow-sm",
                          ev.impact > 0 ? "bg-emerald-500" : "bg-rose-500"
                        )} />
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{format(new Date(ev.date), "MMM dd, yyyy")}</p>
                            <h4 className="text-sm font-bold text-slate-900 leading-tight">{ev.title}</h4>
                          </div>
                          <div className={cn("text-xs font-black tabular-nums", ev.impact > 0 ? "text-emerald-600" : "text-rose-600")}>
                            {ev.impact > 0 ? "+" : ""}{ev.impact}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
               </div>
            </Card>
         </div>
      </div>

      <AnimatePresence>
        {/* ... adjustment form ... */}
        {showAdjustmentForm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="w-full max-w-md"
             >
                <Card title="Manual Credit/Penalty Adjustment">
                   <div className="space-y-6">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setAdjustment({...adjustment, type: "Credit"})}
                          className={cn("flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", adjustment.type === "Credit" ? "bg-emerald-600 text-white shadow-lg" : "bg-slate-50 text-slate-400")}
                        >Credit</button>
                        <button 
                          onClick={() => setAdjustment({...adjustment, type: "Penalty"})}
                          className={cn("flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", adjustment.type === "Penalty" ? "bg-rose-600 text-white shadow-lg" : "bg-slate-50 text-slate-400")}
                        >Penalty</button>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Point Amount</label>
                        <input 
                          type="number" 
                          value={adjustment.amount}
                          onChange={(e) => setAdjustment({...adjustment, amount: parseInt(e.target.value)})}
                          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xl font-black text-slate-900 focus:ring-2 focus:ring-indigo-100 transition-all"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Reason / Justification</label>
                        <textarea 
                          value={adjustment.reason}
                          onChange={(e) => setAdjustment({...adjustment, reason: e.target.value})}
                          placeholder="e.g. Special project contribution, Behavioral escalation..."
                          className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 transition-all"
                        />
                      </div>

                      <div className="flex gap-4 pt-4">
                        <button 
                          onClick={() => setShowAdjustmentForm(false)}
                          className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400"
                        >Cancel</button>
                        <button 
                          onClick={handleManualAdjustment}
                          className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl"
                        >Apply Adjustment</button>
                      </div>
                   </div>
                </Card>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const FileUploader = ({ onUpload, label = "Attach Evidence" }: { onUpload: (files: File[]) => void, label?: string }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onUpload(Array.from(e.target.files));
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-bold uppercase text-slate-400">{label}</label>
      <div 
        onClick={() => fileInputRef.current?.click()}
        className="w-full p-4 border-2 border-dashed border-slate-200 rounded-2xl hover:border-indigo-400 hover:bg-slate-50 transition-all cursor-pointer flex flex-col items-center justify-center gap-2"
      >
        <Paperclip className="w-5 h-5 text-slate-400" />
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Click to upload documents</span>
        <input 
          type="file" 
          multiple 
          ref={fileInputRef} 
          className="hidden" 
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
};

const PersistentCycleSelector = ({
  activeMonthly,
  activeYearly
}: {
  activeMonthly: any;
  activeYearly: any;
}) => {
  return (
    <div className="flex flex-col md:flex-row items-stretch gap-6 bg-white/95 backdrop-blur-md p-6 rounded-[2rem] shadow-xl shadow-indigo-600/5 border border-indigo-100/50 mb-10 sticky top-[5.25rem] z-30 transition-all">
      {/* Active Monthly Cycle */}
      <div className="flex-1 flex items-center gap-4 pr-6 md:border-r border-slate-100 last:border-0">
        <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-slate-200 overflow-hidden shrink-0">
          <Calendar className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[8px] font-black uppercase text-slate-400 tracking-[0.2em] mb-0.5">Active Monthly Cycle</p>
          <h4 className="text-xs font-black text-slate-900 truncate">
            {activeMonthly ? activeMonthly.name : "None Active"}
          </h4>
          {activeMonthly && (
            <p className="text-[10px] font-bold text-slate-500 mt-0.5">
              {format(new Date(activeMonthly.startDate), "MMM dd, yy")} – {format(new Date(activeMonthly.endDate), "MMM dd, yy")}
            </p>
          )}
        </div>
        {activeMonthly && (
          <div className="px-3 py-1 bg-emerald-500 text-white rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm self-center">
            {activeMonthly.status}
          </div>
        )}
      </div>

      {/* Active Yearly Cycle */}
      <div className="flex-1 flex items-center gap-4 pl-0 md:pl-6">
        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200 overflow-hidden shrink-0">
          <Trophy className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[8px] font-black uppercase text-slate-400 tracking-[0.2em] mb-0.5">Active Yearly Cycle</p>
          <h4 className="text-xs font-black text-slate-900 truncate">
            {activeYearly ? activeYearly.name : "None Active"}
          </h4>
          {activeYearly && (
            <p className="text-[10px] font-bold text-slate-500 mt-0.5">
              {format(new Date(activeYearly.startDate), "MMM dd, yy")} – {format(new Date(activeYearly.endDate), "MMM dd, yy")}
            </p>
          )}
        </div>
        {activeYearly && (
          <div className="px-3 py-1 bg-emerald-500 text-white rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm self-center">
            {activeYearly.status}
          </div>
        )}
      </div>
    </div>
  );
};

const EmployeeAppraisalPortal = () => {
  const { user } = useAuth();
  const { data } = useData();

  if (!user) return null;

  // Active cycles
  const activeMonthly = data.appraisalCycles.find(c => c.type === "Monthly" && c.status === "Active");
  const activeYearly = data.appraisalCycles.find(c => c.type === "Yearly" && c.status === "Active");

  // Get active appraisals
  const activeMonthlyAppraisal = activeMonthly 
    ? data.appraisals.find(a => a.employeeId === user.id && a.cycleId === activeMonthly.id)
    : null;
  const activeYearlyAppraisal = activeYearly
    ? data.appraisals.find(a => a.employeeId === user.id && a.cycleId === activeYearly.id)
    : null;

  // All appraisals for user
  const userAppraisals = data.appraisals
    .filter(a => a.employeeId === user.id)
    .map(a => {
      const c = data.appraisalCycles.find(cy => cy.id === a.cycleId);
      return { appraisal: a, cycle: c };
    })
    .filter(item => item.cycle !== undefined)
    .sort((a, b) => (b.cycle?.startDate || "").localeCompare(a.cycle?.startDate || ""));

  const renderActiveCard = (cycle: AppraisalCycle, appraisal: Appraisal | null | undefined, title: string) => {
    const comments = parseManagerComments(appraisal?.managerReview);
    const score = appraisal?.finalScore !== undefined ? appraisal.finalScore : null;

    return (
      <Card title={title} className="h-auto border-indigo-100/50 shadow-md">
        <div className="space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100">
            <div>
              <p className="text-xs font-black text-slate-900">{cycle.name}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Active Cycle</p>
            </div>
            {score !== null && (
              <Badge variant="default">{score} pts</Badge>
            )}
          </div>

          <div className="space-y-3">
            {comments.length > 0 ? (
              comments.map((comm) => {
                let dateLabel = "";
                try {
                  dateLabel = format(new Date(comm.date), "MMM dd, yyyy hh:mm a");
                } catch (err) {
                  dateLabel = "";
                }
                return (
                  <div key={comm.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 leading-relaxed shadow-sm">
                    <p className="text-xs text-slate-600 font-semibold whitespace-pre-wrap">
                      {comm.text}
                    </p>
                    {dateLabel && (
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-2 text-right">
                        {dateLabel}
                      </p>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-slate-400 italic py-4">No reviews logged by your manager for this cycle yet.</p>
            )}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="mb-8 mt-4">
        <h1 className="text-3xl font-black tracking-tighter text-slate-900 uppercase">My Appraisal Portal</h1>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Review manager comments, ratings, and performance history</p>
      </header>

      <div className="grid grid-cols-12 gap-8">
        {/* Left Column: Active Cycles */}
        <div className="col-span-12 lg:col-span-6 space-y-6">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Current Appraisals</h3>
          
          {activeMonthly && renderActiveCard(activeMonthly, activeMonthlyAppraisal, "Active Monthly Appraisal")}
          {activeYearly && renderActiveCard(activeYearly, activeYearlyAppraisal, "Active Yearly Appraisal")}

          {!activeMonthly && !activeYearly && (
            <Card className="p-8 text-center bg-slate-50 border-dashed border-slate-200">
              <p className="text-xs text-slate-400 italic">No appraisal cycles are currently active.</p>
            </Card>
          )}
        </div>

        {/* Right Column: Historical Logs */}
        <div className="col-span-12 lg:col-span-6 space-y-6">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Appraisal History</h3>
          
          <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {userAppraisals.map((item, idx) => {
              const comments = parseManagerComments(item.appraisal.managerReview);
              return (
                <Card key={idx} className="h-auto shadow-sm">
                  <div className="flex justify-between items-start mb-4 pb-3 border-b border-slate-100">
                    <div>
                      <h4 className="text-sm font-black text-slate-900">{item.cycle?.name}</h4>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                        {item.cycle?.type} Cycle • {item.cycle?.status}
                      </p>
                    </div>
                    <div>
                      <Badge variant="default">{item.appraisal.finalScore !== undefined ? `${item.appraisal.finalScore} pts` : "No Score"}</Badge>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {comments.map((comm) => {
                      let dateLabel = "";
                      try {
                        dateLabel = format(new Date(comm.date), "MMM dd, yyyy hh:mm a");
                      } catch (err) {
                        dateLabel = "";
                      }
                      return (
                        <div key={comm.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 leading-relaxed shadow-sm">
                          <p className="text-xs text-slate-600 font-semibold whitespace-pre-wrap">
                            {comm.text}
                          </p>
                          {dateLabel && (
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-2 text-right">
                              {dateLabel}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {comments.length === 0 && (
                      <p className="text-xs text-slate-400 italic">No review comments recorded for this appraisal cycle.</p>
                    )}
                  </div>
                </Card>
              );
            })}
            {userAppraisals.length === 0 && (
              <p className="text-xs text-slate-400 italic text-center py-12">No appraisal history logs found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const AppraisalManagementView = () => {
  const { data, updateData, createAuditLog } = useData();
  const { user } = useAuth();
  
  if (user?.role === "EMPLOYEE") {
    return <EmployeeAppraisalPortal />;
  }
  const [activeTab, setActiveTab] = useState<"landing" | "monthly" | "yearly" | "admin">("landing");
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  
  // Selected historical cycle ID (if any)
  const [viewingCycleId, setViewingCycleId] = useState<string | null>(null);

  const isAdmin = user?.role === "HR";

  const activeMonthlyCycle = data.appraisalCycles.find(c => c.type === "Monthly" && c.status === "Active");
  const activeYearlyCycle = data.appraisalCycles.find(c => c.type === "Yearly" && c.status === "Active");

  const currentCycleId = viewingCycleId || (activeTab === "yearly" ? activeYearlyCycle?.id : activeMonthlyCycle?.id);
  const currentCycle = data.appraisalCycles.find(c => c.id === currentCycleId);

  const renderContent = () => {
    if (selectedEmpId && currentCycle) {
      return (
        <div className="space-y-6">
          <button 
            onClick={() => setSelectedEmpId(null)}
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors"
          >
            <ChevronRight className="w-4 h-4 rotate-180" /> Back to Appraisal Dashboard
          </button>
          <EmployeeDrillDownView 
            empId={selectedEmpId} 
            cycle={{
              id: currentCycle.id,
              start: currentCycle.startDate,
              end: currentCycle.endDate,
              label: currentCycle.name,
              status: currentCycle.status,
              month: currentCycle.month,
              year: currentCycle.year
            }} 
          />
        </div>
      );
    }

    if (activeTab === "monthly") {
      return <MonthlyAppraisalDetails onBack={() => setActiveTab("landing")} onSelectEmployee={setSelectedEmpId} cycleId={currentCycleId} />;
    }

    if (activeTab === "yearly") {
      return <YearlyAppraisalDetails onBack={() => setActiveTab("landing")} onSelectEmployee={setSelectedEmpId} cycleId={currentCycleId} />;
    }

    if (activeTab === "admin" && isAdmin) {
      return <CycleManagementView onBack={() => setActiveTab("landing")} />;
    }

    return (
      <div className="space-y-8">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-2 mt-4">
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-slate-900 uppercase">Appraisal Engine</h1>
          </div>
          
          {isAdmin && (
            <button 
              onClick={() => setActiveTab("admin")}
              className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all"
            >
              <Settings className="w-4 h-4" /> Initialize / Manage Cycles
            </button>
          )}
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="relative group cursor-pointer hover:border-indigo-200 transition-all" onClick={() => { setViewingCycleId(null); setActiveTab("monthly"); }}>
            <div className="flex justify-between items-start mb-8">
              <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white">
                <Calendar className="w-6 h-6" />
              </div>
              {data.appraisalCycles.find(c => c.type === "Monthly" && c.status === "Active") ? <Badge variant="success">Monthly Active</Badge> : <Badge variant="default">Monthly Idle</Badge>}
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Monthly Appraisal Detail</h2>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-6">Monthly cycle progress & tracking</p>
            
            <div className="space-y-4 pt-6 border-t border-slate-100">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Cycles</span>
                <span className="text-sm font-black text-slate-900">{data.appraisalCycles.filter(c => c.type === "Monthly" && c.status === "Active").length}</span>
              </div>
            </div>
            <div className="mt-8 flex items-center gap-2 text-indigo-600 group-hover:gap-4 transition-all">
              <span className="text-[10px] font-black uppercase tracking-widest">Switch to Monthly View</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </Card>

          <Card className="relative group cursor-pointer hover:border-indigo-200 transition-all" onClick={() => { setViewingCycleId(null); setActiveTab("yearly"); }}>
            <div className="flex justify-between items-start mb-8">
              <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
                <Trophy className="w-6 h-6" />
              </div>
              {data.appraisalCycles.find(c => c.type === "Yearly" && c.status === "Active") ? <Badge variant="warning">Yearly Active</Badge> : <Badge variant="default">Annual Idle</Badge>}
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Yearly Appraisal Detail</h2>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-6">Yearly review & planning</p>
            
            <div className="space-y-4 pt-6 border-t border-slate-100">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cycle Strategy</span>
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Manual Control</span>
              </div>
            </div>
            <div className="mt-8 flex items-center gap-2 text-indigo-600 group-hover:gap-4 transition-all">
              <span className="text-[10px] font-black uppercase tracking-widest">Switch to Yearly View</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </Card>
        </div>

        <div className="mt-12">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-8">Historical Completion Snapshots</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             {data.appraisalCycles.filter(c => (c.status === "Completed" || c.status === "Archived") && parseLocalDate(c.startDate) >= parseLocalDate("2026-05-01")).slice(0, 3).map(c => (
               <Card 
                 key={c.id} 
                 className="p-6 bg-slate-50 border-slate-200 cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all"
                 onClick={() => {
                   setViewingCycleId(c.id);
                   setActiveTab(c.type === "Monthly" ? "monthly" : "yearly");
                 }}
               >
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{c.type} Snapshot</p>
                  <h4 className="text-sm font-black text-slate-900 mb-4">{c.name}</h4>
                  <div className="space-y-3 pt-4 border-t border-slate-200">
                     <div className="flex justify-between">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Completion</span>
                        <span className="text-[10px] font-black text-emerald-600">87%</span>
                     </div>
                  </div>
               </Card>
             ))}
             {data.appraisalCycles.filter(c => (c.status === "Completed" || c.status === "Archived") && parseLocalDate(c.startDate) >= parseLocalDate("2026-05-01")).length === 0 && (
               <div className="col-span-full py-12 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No historical snapshots available</p>
               </div>
             )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <PersistentCycleSelector 
        activeMonthly={activeMonthlyCycle}
        activeYearly={activeYearlyCycle}
      />
      {renderContent()}
    </div>
  );
};

const SubmissionCard = ({ sub, isHR, isManagement, onApprove, onReject, onDelete, onUpdateAch, feedback, onFeedbackChange, employee }: { 
  sub: Submission; 
  isHR: boolean; 
  isManagement: boolean;
  onApprove: () => void; 
  onReject: () => void;
  onDelete: () => void;
  onUpdateAch: (ach: string[]) => void;
  feedback: string;
  onFeedbackChange: (val: string) => void;
  employee: Employee;
}) => {
  const { user } = useAuth();
  const isOwn = user?.id === employee.id;
  const canReview = isHR && !isOwn && sub.status === "Submitted";
  const canDelete = isOwn && sub.status === "Submitted";

  return (
    <Card 
      key={sub.id} 
      title={`Week of ${format(new Date(sub.weekStarting), "MMM dd")}`}
      subtitle={!isOwn ? formatEmpName(employee) : undefined}
      className="hover:shadow-md transition-all relative group overflow-visible"
    >
      <div className="space-y-6">
        <div>
           <div className="flex justify-between items-center mb-4">
              <h5 className="text-[9px] font-black uppercase tracking-widest text-indigo-600 flex items-center gap-2">
                 <span className="w-4 h-[1px] bg-indigo-600"></span>
                 Key Contributions
              </h5>
              {canDelete && (
                <button onClick={onDelete} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
           </div>
           <ul className="space-y-3">
              {sub.achievements.map((a, i) => (
                <li key={i} className="text-xs font-semibold text-slate-600 flex items-start gap-4 bg-slate-50/50 p-4 rounded-[1.25rem] border border-slate-100 group/item">
                   <CheckCircle2 className="w-4 h-4 text-slate-300 group-hover/item:text-emerald-400 shrink-0 mt-0.5" />
                   {isOwn && sub.status === "Submitted" ? (
                      <div className="flex-1 flex gap-2">
                        <input 
                          value={a}
                          className="flex-1 bg-transparent border-none p-0 text-xs font-semibold focus:ring-0"
                          onChange={(e) => {
                            const next = [...sub.achievements];
                            next[i] = e.target.value;
                            onUpdateAch(next);
                          }}
                        />
                        <button onClick={() => onUpdateAch(sub.achievements.filter((_, idx) => idx !== i))}>
                          <XCircle className="w-3 h-3 text-slate-300 hover:text-rose-400" />
                        </button>
                      </div>
                   ) : (
                      <span>{a}</span>
                   )}
                </li>
              ))}
              {isOwn && sub.status === "Submitted" && (
                <button 
                 onClick={() => onUpdateAch([...sub.achievements, ""])}
                 className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600 pl-4 py-2 hover:opacity-70 transition-opacity"
                >
                   <Plus className="w-3 h-3" /> Add Achievement
                </button>
              )}
           </ul>
        </div>

        {sub.attachments && sub.attachments.length > 0 && (
          <div className="pt-4">
             <h6 className="text-[9px] font-black uppercase text-slate-400 mb-3 tracking-widest">Evidence Files</h6>
             <div className="flex flex-wrap gap-2">
               {sub.attachments.map(att => (
                 <a key={att.id} href={att.url} target="_blank" className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500 hover:border-indigo-200 hover:text-indigo-600 transition-all">
                    <Paperclip className="w-3 h-3" />
                    {att.name}
                 </a>
               ))}
             </div>
          </div>
        )}

        <div className="pt-6 border-t border-slate-100 flex flex-col gap-4">
          <div className="flex items-center justify-between">
             <div className="flex items-center gap-3">
               <Badge 
                 variant={sub.status === "Approved" ? "success" : sub.status === "Rejected" ? "danger" : "warning"}
                 className="rounded-full px-4"
               >
                  {sub.status}
               </Badge>
               {sub.approvedAt && (
                 <span className="text-[9px] font-medium text-slate-400">Approved {format(new Date(sub.approvedAt), "MMM dd")}</span>
               )}
             </div>
             {!isOwn && (
                <div className="flex -space-x-2">
                   <div className="w-6 h-6 rounded-full bg-indigo-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-indigo-600">
                      {employee.name[0]}
                   </div>
                </div>
             )}
          </div>

          {sub.managerFeedback ? (
             <div className="p-4 bg-indigo-50/30 rounded-2xl border border-indigo-100/50">
               <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Feedback</p>
               <p className="text-[11px] font-semibold text-indigo-900 leading-relaxed italic">"{sub.managerFeedback}"</p>
             </div>
          ) : canReview && (
            <div className="space-y-4 pt-2">
               <textarea 
                 placeholder="Provide feedback for the weekly review..."
                 className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-medium focus:bg-white focus:ring-1 focus:ring-indigo-100 transition-all min-h-[80px]"
                 value={feedback}
                 onChange={(e) => onFeedbackChange(e.target.value)}
               />
               <div className="flex gap-2">
                 <button 
                  onClick={onReject}
                  className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-50 hover:text-rose-600 hover:border-rose-100 transition-all"
                 >
                   Reject
                 </button>
                 <button 
                  onClick={onApprove}
                  className="flex-2 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-100 flex items-center justify-center gap-2"
                 >
                   <CheckCircle2 className="w-3 h-3" /> Approve Review
                 </button>
               </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

const WeeklyReview = () => {
  const { user } = useAuth();
  const { data, updateData, showToast, createAuditLog } = useData();
  const location = useLocation();
  const [feedback, setFeedback] = useState<{ [key: string]: string }>({});
  const [isAdding, setIsAdding] = useState(false);
  const [tempAttachments, setTempAttachments] = useState<File[]>([]);
  const [statusFilter, setStatusFilter] = useState<"Progress" | "Completed" | "Rejected">("Progress");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (location.state && (location.state as any).openNew) {
      setIsAdding(true);
    }
  }, [location.state]);

  const [newSub, setNewSub] = useState({ achievements: [""], weekStarting: format(startOfWeek(new Date()), "yyyy-MM-dd") });

  const isHR = user?.role === "HR";
  const isManagement = user?.role === "MANAGEMENT";
  const canSeeAllSubmissions = isHR || isManagement;

  const handleAddSubmission = async () => {
    if (!user) return;
    
    // Simulate file upload
    const attachments: Attachment[] = tempAttachments.map(f => ({
      id: `att-${Date.now()}-${Math.random()}`,
      name: f.name,
      url: "#",
      type: f.type,
      size: f.size,
      uploadedAt: new Date().toISOString()
    }));

    const sub: Submission = {
      id: `s-${Date.now()}`,
      employeeId: user.id,
      weekStarting: newSub.weekStarting,
      tasks: [],
      achievements: newSub.achievements.filter(a => a.trim() !== ""),
      challenges: [],
      status: "Submitted",
      attachments
    };

    const newSubmissions = [...data.submissions, sub];
    
    // Notify all HR/Management users
    let newNotifications: Notification[] = [...data.notifications];
    const hrs = data.employees.filter(e => e.role === "HR" || e.role === "MANAGEMENT");
    hrs.forEach(hr => {
      if (hr.id !== user.id) {
        newNotifications.push({
          id: `n-${Date.now()}-${Math.random()}`,
          userId: hr.id,
          title: "New Review Submission",
          message: `${user.name} submitted their weekly review.`,
          type: "Submission" as Notification["type"],
          read: false,
          date: new Date().toISOString()
        });
      }
    });

    const log = createAuditLog("CREATE", sub.id, `Weekly submission created for week starting: ${sub.weekStarting}`, user.id);
    await updateData({
      ...data,
      submissions: newSubmissions,
      notifications: newNotifications,
      auditLogs: [log, ...data.auditLogs]
    });
    setIsAdding(false);
    setTempAttachments([]);
    setNewSub({ achievements: [""], weekStarting: format(startOfWeek(new Date()), "yyyy-MM-dd") });
    showToast("Submission successful!");
  };

  const getFilteredSubmissions = () => {
    let filtered = data.submissions.filter(s => {
      if (s.employeeId === user?.id) return true;
      return canSeeAllSubmissions;
    });

    if (statusFilter === "Progress") {
       filtered = filtered.filter(s => s.status === "Submitted");
    } else if (statusFilter === "Completed") {
       filtered = filtered.filter(s => s.status === "Approved");
    } else if (statusFilter === "Rejected") {
       filtered = filtered.filter(s => s.status === "Rejected");
    }

    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(s => {
        const emp = data.employees.find(e => e.id === s.employeeId);
        if (!emp) return false;
        const matchesName = emp.name.toLowerCase().includes(query);
        const matchesId = emp.empId ? emp.empId.toLowerCase().includes(query) : emp.id.toLowerCase().includes(query);
        return matchesName || matchesId;
      });
    }

    return [...filtered].sort((a, b) => new Date(b.weekStarting).getTime() - new Date(a.weekStarting).getTime());
  };

  const submissions = getFilteredSubmissions();

  const updateSubmission = async (subId: string, achievements: string[]) => {
    const newSubmissions = data.submissions.map(s => 
      s.id === subId ? { ...s, achievements } : s
    );
    await updateData({ ...data, submissions: newSubmissions });
  };

  const approveSubmission = async (subId: string) => {
    const managerComment = feedback[subId] || "Approved by manager.";
    const sub = data.submissions.find(s => s.id === subId);
    if (!sub) return;

    const approvalDate = new Date().toISOString();
    const newSubmissions = data.submissions.map(s => 
      s.id === subId ? { ...s, status: "Approved" as any, managerFeedback: managerComment, approvedAt: approvalDate } : s
    );
    
    // Award credits based on unified scoring
    const pointsToAward = calculateSubmissionPoints(sub, data.pointConfig);
    const newEmployees = data.employees.map(e => 
      e.id === sub.employeeId ? { 
        ...e, 
        credits: Math.min(1000, e.credits + pointsToAward)
      } : e
    );

    // Update monthly scores if active cycle exists (Refresh Monthly Appraisal totals)
    let newMonthlyScores = [...(data.monthlyScores || [])];
    const activeMonthlyCycle = data.appraisalCycles.find(c => c.type === "Monthly" && c.status === "Active");
    if (activeMonthlyCycle) {
      // Check if approval date falls inside active cycle as per user request
      if (new Date(approvalDate) >= new Date(activeMonthlyCycle.startDate) && new Date(approvalDate) <= new Date(activeMonthlyCycle.endDate)) {
        const scoreIndex = newMonthlyScores.findIndex(ms => ms.employeeId === sub.employeeId && ms.cycleId === activeMonthlyCycle.id);
        if (scoreIndex >= 0) {
          newMonthlyScores[scoreIndex].score += pointsToAward;
        } else {
          newMonthlyScores.push({
            id: `ms-${Date.now()}`,
            employeeId: sub.employeeId,
            cycleId: activeMonthlyCycle.id,
            score: pointsToAward,
            month: activeMonthlyCycle.month || new Date().getMonth() + 1,
            year: activeMonthlyCycle.year
          });
        }
      }
    }

    const newNotifications: Notification[] = [...data.notifications, {
      id: `n-${Date.now()}`,
      userId: sub.employeeId,
      title: "Submission Approved",
      message: `Your weekly submission for ${sub.weekStarting} has been approved. You earned ${pointsToAward} credits!`,
      type: "Submission",
      read: false,
      date: new Date().toISOString()
    }];

    const log = createAuditLog("STATUS_CHANGE", subId, `Approved weekly submission for week starting ${sub.weekStarting}`, user?.id);
    await updateData({
      ...data,
      submissions: newSubmissions,
      notifications: newNotifications,
      employees: newEmployees,
      monthlyScores: newMonthlyScores,
      auditLogs: [log, ...data.auditLogs]
    });
    showToast(`Submission approved. ${pointsToAward} points awarded to employee.`);
  };

  const rejectSubmission = async (subId: string) => {
    const managerComment = feedback[subId] || "Revisions required.";
    const sub = data.submissions.find(s => s.id === subId);
    if (!sub) return;

    const newSubmissions = data.submissions.map(s => 
      s.id === subId ? { ...s, status: "Rejected" as any, managerFeedback: managerComment } : s
    );

    const newNotifications = [...data.notifications, {
      id: `n-${Date.now()}`,
      userId: sub.employeeId,
      title: "Submission Rejected",
      message: `Your weekly submission for ${sub.weekStarting} was rejected. Feedback: ${managerComment}`,
      type: "Submission" as Notification["type"],
      read: false,
      date: new Date().toISOString()
    }];

    const log = createAuditLog("STATUS_CHANGE", subId, `Rejected weekly submission for week starting ${sub.weekStarting}`, user?.id);
    await updateData({
      ...data,
      submissions: newSubmissions,
      notifications: newNotifications,
      auditLogs: [log, ...data.auditLogs]
    });
    showToast("Submission rejected.");
  };

  const deleteSubmission = async (subId: string) => {
    if (!window.confirm("Are you sure you want to delete this submission?")) return;
    const sub = data.submissions.find(s => s.id === subId);
    const log = createAuditLog("EDIT", subId, `Deleted weekly submission for week starting ${sub?.weekStarting || 'unknown'}`, user?.id);
    const newSubmissions = data.submissions.filter(s => s.id !== subId);
    await updateData({
      ...data,
      submissions: newSubmissions,
      auditLogs: [log, ...data.auditLogs]
    });
    showToast("Submission deleted successfully.");
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 bg-white p-8 rounded-[2rem] border border-slate-200">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-slate-900 uppercase">Weekly Submissions</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{submissions.length} Shown</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
           <div className="relative">
             <input 
               type="text"
               placeholder="Search by name or ID..."
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[10px] font-bold uppercase tracking-widest focus:ring-2 focus:ring-indigo-100 placeholder-slate-400 min-w-[200px]"
             />
             <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
           </div>

           {/* Quick Filter Tabs */}
           <div className="flex bg-slate-100 p-1.5 rounded-xl">
             {[
               { id: "Progress", label: "In Progress" },
               { id: "Completed", label: "Completed" },
               { id: "Rejected", label: "Rejected" }
             ].map(tab => (
               <button
                 key={tab.id}
                 onClick={() => setStatusFilter(tab.id as any)}
                 className={cn(
                   "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                   statusFilter === tab.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                 )}
               >
                 {tab.label}
               </button>
             ))}
           </div>

          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white font-bold uppercase text-[10px] tracking-[0.2em] rounded-2xl hover:bg-slate-800 transition-all shadow-lg shadow-indigo-100 whitespace-nowrap"
          >
               New Submission
          </button>
        </div>
      </header>

      {isAdding && (
        <Card title="New Weekly Submission" className="mb-8 overflow-visible">
           <div className="space-y-6">
              <div className="space-y-2">
                 <label className="text-[10px] font-bold uppercase text-slate-400">Week Starting</label>
                 <input 
                   type="date" 
                   value={newSub.weekStarting}
                   className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                   onChange={(e) => setNewSub({...newSub, weekStarting: e.target.value})}
                 />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold uppercase text-slate-400">Key Achievements & Tasks</label>
                  <button 
                    onClick={() => setNewSub({...newSub, achievements: [...newSub.achievements, ""]})}
                    className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {newSub.achievements.map((ach, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="e.g. Completed initial frontend prototype"
                      value={ach}
                      onChange={(e) => {
                        const next = [...newSub.achievements];
                        next[idx] = e.target.value;
                        setNewSub({...newSub, achievements: next});
                      }}
                      className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white transition-all"
                    />
                    {newSub.achievements.length > 1 && (
                      <button 
                        onClick={() => {
                          const next = newSub.achievements.filter((_, i) => i !== idx);
                          setNewSub({...newSub, achievements: next});
                        }}
                        className="p-3 text-slate-300 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-slate-400">Attachments (Screenshots / PDFs)</label>
                <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-[2rem] bg-slate-50 hover:bg-slate-100/50 transition-colors cursor-pointer relative group">
                  <div className="flex flex-col items-center gap-2 group-hover:scale-110 transition-transform">
                     <div className="p-3 bg-white rounded-2xl shadow-sm text-slate-400">
                        <Upload className="w-5 h-5" />
                     </div>
                     <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-2">{tempAttachments.length > 0 ? `${tempAttachments.length} Files Selected` : 'Click or drag files to upload'}</p>
                  </div>
                  <input 
                    type="file" 
                    multiple 
                    onChange={(e) => e.target.files && setTempAttachments(Array.from(e.target.files))}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
                {tempAttachments.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {tempAttachments.map((f, i) => (
                      <Badge key={i} variant="default" className="pl-3 pr-1 py-1.5 rounded-lg flex items-center gap-2 bg-slate-100 text-slate-600 border-none">
                        <span className="text-[9px] font-bold">{f.name}</span>
                        <button onClick={() => setTempAttachments(tempAttachments.filter((_, j) => i !== j))} className="p-1 hover:bg-slate-200 rounded-md transition-colors"><XCircle className="w-3 h-3" /></button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-4 pt-4">
                 <button onClick={() => setIsAdding(false)} className="flex-1 py-4 text-[10px] font-black uppercase text-slate-400 hover:text-slate-900 transition-colors">Cancel</button>
                 <button 
                  onClick={handleAddSubmission} 
                  disabled={newSub.achievements.every(a => !a.trim())}
                  className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-slate-200 disabled:opacity-20 transition-all hover:-translate-y-1"
                >
                  Create Submission
                </button>
              </div>
           </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-20">
        {submissions.length === 0 ? (
          <div className="col-span-full py-20 bg-slate-50 rounded-[2.5rem] border border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
             <Inbox className="w-12 h-12 text-slate-200 mb-4" />
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No submissions found in this category.</p>
          </div>
        ) : (
          submissions.map(sub => (
            <SubmissionCard 
              key={sub.id} 
              sub={sub} 
              isHR={isHR}
              isManagement={isManagement}
              onApprove={() => approveSubmission(sub.id)}
              onReject={() => rejectSubmission(sub.id)}
              onDelete={() => deleteSubmission(sub.id)}
              onUpdateAch={(ach) => updateSubmission(sub.id, ach)}
              feedback={feedback[sub.id] || ""}
              onFeedbackChange={(val) => setFeedback({...feedback, [sub.id]: val})}
              employee={data.employees.find(e => e.id === sub.employeeId)!}
            />
          ))
        )}
      </div>
    </div>
  );
};

const AchievementsView = () => {
  const { user } = useAuth();
  const { data, updateData, createAuditLog } = useData();
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [tempAttachments, setTempAttachments] = useState<File[]>([]);
  const [newAchievement, setNewAchievement] = useState<Partial<Achievement>>({
    title: "",
    description: "",
    type: "Innovation",
    date: format(new Date(), "yyyy-MM-dd")
  });
  const [feedback, setFeedback] = useState<{ [key: string]: string }>({});

  const isAdmin = user?.role === "HR";
  const isEmployee = user?.role === "EMPLOYEE";
  const [filter, setFilter] = useState<"Progress" | "Completed" | "Rejected">("Progress");
  const [searchQuery, setSearchQuery] = useState("");

  const getAchievementsByStatus = () => {
    let filtered = data.achievements;
    
    // Role based scoping
    if (isEmployee) {
      filtered = filtered.filter(a => a.employeeId === user?.id);
    }

    // Status filtering
    if (filter === "Progress") {
       filtered = filtered.filter(a => a.status === "Pending");
    } else if (filter === "Completed") {
       filtered = filtered.filter(a => a.status === "Approved");
    } else {
       filtered = filtered.filter(a => a.status === "Rejected");
    }

    // Search query filter (employee name or ID)
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(a => {
        const emp = data.employees.find(e => e.id === a.employeeId);
        if (!emp) return false;
        const matchesName = emp.name.toLowerCase().includes(query);
        const matchesId = emp.empId ? emp.empId.toLowerCase().includes(query) : emp.id.toLowerCase().includes(query);
        return matchesName || matchesId;
      });
    }

    // Sorting by date (Newest -> Oldest)
    return [...filtered].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const myAchievements = data.achievements.filter(a => a.employeeId === user?.id);
  const displayAchievements = getAchievementsByStatus();

  const handleAddAchievement = async () => {
    if (!user) return;
    
    const attachments: Attachment[] = tempAttachments.map(f => ({
      id: `att-${Date.now()}-${Math.random()}`,
      name: f.name,
      url: "#",
      type: f.type,
      size: f.size,
      uploadedAt: new Date().toISOString()
    }));

    const achievement: Achievement = {
      id: `ach-${Date.now()}`,
      employeeId: user.id,
      title: newAchievement.title || "Untitled Achievement",
      description: newAchievement.description || "",
      date: newAchievement.date || format(new Date(), "yyyy-MM-dd"),
      type: (newAchievement.type as any) || "Innovation",
      status: "Pending",
      attachments
    };

    const newAchievements = [achievement, ...data.achievements];
    const log = createAuditLog("CREATE", achievement.id, `Reported achievement: ${achievement.title}`, user.id);

    // Notify all HR/Management users
    let newNotifications: Notification[] = [...data.notifications];
    const authorized = data.employees.filter(e => e.role === "HR" || e.role === "MANAGEMENT");
    authorized.forEach(adm => {
      if (adm.id !== user.id) {
        newNotifications.push({
          id: `n-${Date.now()}-${Math.random()}`,
          userId: adm.id,
          title: "New Achievement Submission",
          message: `${user.name} submitted a new achievement: ${achievement.title}`,
          type: "System",
          read: false,
          date: new Date().toISOString()
        });
      }
    });

    await updateData({ 
      ...data, 
      achievements: newAchievements, 
      notifications: newNotifications, 
      auditLogs: [log, ...data.auditLogs] 
    });
    setShowSubmitModal(false);
    setNewAchievement({ title: "", description: "", type: "Innovation", date: format(new Date(), "yyyy-MM-dd") });
    setTempAttachments([]);
  };

  const approveAchievement = async (id: string) => {
    const ach = data.achievements.find(a => a.id === id);
    if (!ach) return;

    const managerComment = feedback[id] || "Achievement verified and approved.";
    const approvalDate = new Date().toISOString();
    
    // Calculate points
    let points = data.pointConfig?.achievement || 10;
    if (ach.type === "Certification") points = data.pointConfig?.certification || 15;
    if (ach.weightage) points = ach.weightage;

    const newAchievements = data.achievements.map(a => 
      a.id === id ? { ...a, status: "Approved" as any, managerComment, approvedAt: approvalDate } : a
    );

    // Update Employee Credits
    const newEmployees = data.employees.map(e => 
      e.id === ach.employeeId ? { 
        ...e, 
        credits: Math.min(1000, e.credits + points)
      } : e
    );

    // Update monthly scores if active cycle exists (Automatic Point Posting)
    let newMonthlyScores = [...(data.monthlyScores || [])];
    const activeMonthlyCycle = data.appraisalCycles.find(c => c.type === "Monthly" && c.status === "Active");
    if (activeMonthlyCycle) {
      if (new Date(approvalDate) >= new Date(activeMonthlyCycle.startDate) && new Date(approvalDate) <= new Date(activeMonthlyCycle.endDate)) {
        const scoreIndex = newMonthlyScores.findIndex(ms => ms.employeeId === ach.employeeId && ms.cycleId === activeMonthlyCycle.id);
        if (scoreIndex >= 0) {
          newMonthlyScores[scoreIndex].score += points;
        } else {
          newMonthlyScores.push({
            id: `ms-${Date.now()}`,
            employeeId: ach.employeeId,
            cycleId: activeMonthlyCycle.id,
            score: points,
            month: activeMonthlyCycle.month || new Date().getMonth() + 1,
            year: activeMonthlyCycle.year
          });
        }
      }
    }

    const newNotifications: Notification[] = [...data.notifications, {
      id: `n-${Date.now()}`,
      userId: ach.employeeId,
      title: "Achievement Approved!",
      message: `Your achievement "${ach.title}" has been approved. +${points} credits!`,
      type: "System",
      read: false,
      date: new Date().toISOString()
    }];

    const log = createAuditLog("STATUS_CHANGE", id, `Approved achievement: ${ach.title}`, user?.id);

    await updateData({ 
      ...data, 
      achievements: newAchievements, 
      employees: newEmployees, 
      monthlyScores: newMonthlyScores,
      notifications: newNotifications,
      auditLogs: [log, ...data.auditLogs]
    });
    setFeedback({ ...feedback, [id]: "" });
  };

  const rejectAchievement = async (id: string) => {
    const ach = data.achievements.find(a => a.id === id);
    if (!ach) return;
    const managerComment = feedback[id] || "Achievement could not be verified.";
    const newAchievements = data.achievements.map(a => 
      a.id === id ? { ...a, status: "Rejected" as any, managerComment } : a
    );
    const log = createAuditLog("STATUS_CHANGE", id, `Rejected achievement: ${ach.title}`, user?.id);

    const newNotifications: Notification[] = [...data.notifications, {
      id: `n-${Date.now()}-${Math.random()}`,
      userId: ach.employeeId,
      title: "Achievement Rejected",
      message: `Your achievement "${ach.title}" was rejected. Feedback: ${managerComment}`,
      type: "System",
      read: false,
      date: new Date().toISOString()
    }];

    await updateData({ 
      ...data, 
      achievements: newAchievements, 
      notifications: newNotifications, 
      auditLogs: [log, ...data.auditLogs] 
    });
    setFeedback({ ...feedback, [id]: "" });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex justify-between items-center bg-white p-8 rounded-[2rem] border border-slate-200">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-slate-900 uppercase">Achievements Hub</h1>
        </div>
        {isEmployee && (
          <button 
            onClick={() => setShowSubmitModal(true)}
            className="px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-2xl shadow-indigo-200 hover:-translate-y-1 transition-all"
          >
            Report New Achievement
          </button>
        )}
      </header>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl w-fit">
          {(["Progress", "Completed", "Rejected"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={cn(
                "px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                filter === tab ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              {tab === "Progress" ? "Under Review" : tab}
            </button>
          ))}
        </div>

        <div className="relative">
          <input 
            type="text"
            placeholder="Search by name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-bold uppercase tracking-widest focus:ring-2 focus:ring-indigo-100 placeholder-slate-400 min-w-[240px]"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 space-y-6">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 font-bold">Achievement Records</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {displayAchievements.length === 0 && (
              <div className="col-span-full py-20 text-center bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200">
                <Trophy className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No achievements found</p>
              </div>
            )}
            {displayAchievements.map(ach => {
              const emp = data.employees.find(e => e.id === ach.employeeId);
              const isPending = ach.status === "Pending";
              const canAction = isPending && isAdmin;

              return (
                <Card key={ach.id} className="group hover:border-indigo-200 transition-all">
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-2">
                       <div className="p-3 bg-slate-50 rounded-2xl text-slate-900">
                        {ach.type === "Certification" ? <Award className="w-5 h-5 text-indigo-600" /> : <Trophy className="w-5 h-5 text-amber-500" />}
                      </div>
                      {(!isEmployee || isAdmin) && (
                         <div className="ml-2">
                           <p className="text-[9px] font-black text-slate-900 uppercase leading-none mb-0.5">{formatEmpName(emp)}</p>
                           <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{emp?.department}</p>
                         </div>
                      )}
                    </div>
                    <Badge variant={ach.status === "Approved" ? "success" : ach.status === "Rejected" ? "danger" : "warning"}>
                      {ach.status}
                    </Badge>
                  </div>
                  <h4 className="text-sm font-black text-slate-900 mb-2">{ach.title}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">{format(new Date(ach.date), "MMMM dd, yyyy")}</p>
                  <p className="text-[11px] font-medium text-slate-500 leading-relaxed mb-6 line-clamp-3">{ach.description}</p>
                  
                  {canAction ? (
                    <div className="space-y-3 pt-6 border-t border-slate-100">
                       <textarea 
                         placeholder="Verification note..."
                         className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-medium"
                         value={feedback[ach.id] || ""}
                         onChange={(e) => setFeedback({ ...feedback, [ach.id]: e.target.value })}
                       />
                       <div className="flex gap-2">
                          <button onClick={() => approveAchievement(ach.id)} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest">Approve</button>
                          <button onClick={() => rejectAchievement(ach.id)} className="flex-1 py-3 bg-rose-50 text-rose-600 rounded-xl text-[9px] font-black uppercase tracking-widest">Reject</button>
                       </div>
                    </div>
                  ) : (
                    <>
                      {ach.managerComment && (
                        <div className="p-4 bg-slate-50 rounded-2xl mb-6">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Manager Note</p>
                          <p className="text-[10px] font-bold text-slate-600 italic">"{ach.managerComment}"</p>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-6 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <History className="w-3 h-3 text-slate-300" />
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{ach.type}</span>
                        </div>
                        <div className="flex -space-x-2">
                          {ach.attachments?.map((att, i) => (
                            <div key={att.id} className="w-6 h-6 rounded-full bg-white border-2 border-slate-50 flex items-center justify-center shadow-sm" title={att.name}>
                              <Paperclip className="w-2.5 h-2.5 text-slate-400" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showSubmitModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-xl">
              <Card title="Report Achievement" className="shadow-2xl">
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Achievement Type</label>
                      <select 
                        value={newAchievement.type}
                        onChange={e => setNewAchievement({...newAchievement, type: e.target.value as any})}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none ring-offset-white focus:ring-2 focus:ring-indigo-100"
                      >
                        <option value="Innovation">Innovation Win</option>
                        <option value="KT">Knowledge Transfer</option>
                        <option value="Client Appreciation">Client Appreciation</option>
                        <option value="Extra Mile">Extra Mile</option>
                        <option value="Certification">Professional Certification</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Event Date</label>
                      <input 
                        type="date" 
                        value={newAchievement.date}
                        onChange={e => setNewAchievement({...newAchievement, date: e.target.value})}
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold" 
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Achievement Title</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Q4 Regional Knowledge Transfer Leadership"
                      value={newAchievement.title}
                      onChange={e => setNewAchievement({...newAchievement, title: e.target.value})}
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold" 
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Detailed Description</label>
                    <textarea 
                      placeholder="Describe the impact and context of your achievement..."
                      value={newAchievement.description}
                      onChange={e => setNewAchievement({...newAchievement, description: e.target.value})}
                      className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
                    />
                  </div>

                  <FileUploader onUpload={(files) => setTempAttachments([...tempAttachments, ...files])} />
                  
                  {tempAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {tempAttachments.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 bg-indigo-50 border border-indigo-100 rounded-xl text-[10px] font-bold text-indigo-600">
                          <Paperclip className="w-3 h-3" /> {f.name} ({(f.size! / 1024).toFixed(1)}KB)
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-4 pt-4">
                    <button onClick={() => setShowSubmitModal(false)} className="flex-1 py-4 text-[10px] font-black uppercase text-slate-400">Discard</button>
                    <button 
                      onClick={handleAddAchievement}
                      disabled={!newAchievement.title || !newAchievement.description}
                      className="flex-1 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase shadow-xl hover:shadow-indigo-200 disabled:opacity-20 transition-all"
                    >
                      Submit for Verification
                    </button>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};


// --- Main Layout ---

const Sidebar = () => {
  const { user } = useAuth();
  const { data, updateData, showToast } = useData();
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);

  const currentUser = data.employees.find(e => e.id === user?.id);
  const currentUserProfilePicture = currentUser?.profilePicture;

  const handleAvatarClick = () => {
    setShowAvatarMenu(!showAvatarMenu);
  };

  const handleViewClick = () => {
    setShowAvatarMenu(false);
    setShowViewModal(true);
  };

  const handleEditClick = () => {
    setShowAvatarMenu(false);
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const MAX_WIDTH = 128;
        const MAX_HEIGHT = 128;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);

        // Update employee in state & database
        const updatedEmployees = data.employees.map(emp => 
          emp.id === user?.id ? { ...emp, profilePicture: dataUrl } : emp
        );
        
        await updateData({
          ...data,
          employees: updatedEmployees
        });
        showToast("Profile picture updated successfully!", "success");
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const navItems = [
    { label: "Dashboard", path: "/", icon: BarChart3 },
    { label: "Goals", path: "/goals", icon: Target },
    { label: "Submissions", path: "/submissions", icon: ClipboardList },
    { label: "Achievements", path: "/achievements", icon: Trophy },
  ];

  if (user?.role !== "EMPLOYEE") {
    navItems.push({ label: "Appraisal", path: "/appraisal", icon: TrendingUp });
  }

  const isHR = user?.role === "HR";
  const isManagement = user?.role === "MANAGEMENT";

  if (isHR || isManagement) {
    navItems.push({ label: "Team Goals", path: "/team-goals", icon: Users });
    navItems.push({ label: "Review", path: "/review", icon: Award });
    navItems.push({ label: "Complaints", path: "/complaints", icon: AlertCircle });
  }
  
  navItems.push({ label: "Growth & Recognition", path: "/recognition", icon: Sparkles });

  // Dynamic Settings check from database permissions
  const perm = data.permissions?.find(p => p.role === user?.role);
  const showSettings = perm?.modules?.settings ?? (isHR || isManagement);
  if (showSettings) {
    navItems.push({ label: "Settings", path: "/settings", icon: Settings });
  }

  return (
    <>
      <aside className="fixed inset-y-0 left-0 w-64 bg-[#f8fafc] border-r border-slate-200 hidden xl:flex flex-col z-40">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg overflow-hidden bg-white">
               <img src={logoImg} className="w-full h-full object-cover" alt="Insight360x Logo" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-widest leading-none uppercase text-slate-900">INSIGHT<span className="text-indigo-600">360x</span></h2>
              <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Performance Engine</p>
            </div>
          </div>
          
          <nav className="space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 text-[11px] font-bold uppercase tracking-widest transition-all rounded-xl",
                  location.pathname === item.path 
                    ? "bg-slate-900 text-white shadow-lg shadow-slate-900/10" 
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-4 m-4 bg-white rounded-2xl border border-slate-200 shadow-sm relative">
           <div className="flex items-center gap-3">
              <div 
                onClick={handleAvatarClick}
                className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white font-black text-sm shadow-md overflow-hidden relative group cursor-pointer"
                title="Profile menu"
              >
                 {currentUserProfilePicture ? (
                   <img src={currentUserProfilePicture} className="w-full h-full object-cover" alt="Profile" />
                 ) : (
                   getInitials(currentUser?.name)
                 )}
                 <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                   <Camera className="w-3.5 h-3.5 text-white" />
                 </div>
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleAvatarChange} 
                accept="image/*" 
                className="hidden" 
              />
              <div className="overflow-hidden">
                 <p className="text-[11px] font-bold text-slate-900 truncate">
                   {formatEmpName(currentUser)}
                 </p>
                 <p className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest">{user?.role}</p>
              </div>
           </div>

           {/* Avatar Menu Options */}
           <AnimatePresence>
             {showAvatarMenu && (
               <>
                 <div 
                   className="fixed inset-0 z-40 cursor-default" 
                   onClick={() => setShowAvatarMenu(false)} 
                 />
                 <motion.div 
                   initial={{ opacity: 0, y: 10, scale: 0.95 }}
                   animate={{ opacity: 1, y: 0, scale: 1 }}
                   exit={{ opacity: 0, y: 10, scale: 0.95 }}
                   transition={{ duration: 0.15 }}
                   className="absolute bottom-20 left-4 right-4 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50 flex flex-col gap-1"
                 >
                   <button
                     onClick={handleViewClick}
                     className="w-full flex items-center gap-2.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/50 rounded-xl transition-all"
                   >
                     <Eye className="w-4 h-4 shrink-0 text-slate-400" />
                     View Picture
                   </button>
                   <button
                     onClick={handleEditClick}
                     className="w-full flex items-center gap-2.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/50 rounded-xl transition-all"
                   >
                     <Camera className="w-4 h-4 shrink-0 text-slate-400" />
                     Change Photo
                   </button>
                 </motion.div>
               </>
             )}
           </AnimatePresence>
        </div>
      </aside>

      {/* View Picture Modal */}
      <AnimatePresence>
        {showViewModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowViewModal(false)}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-[2rem] overflow-hidden shadow-2xl max-w-sm w-full border border-slate-100 p-8 flex flex-col items-center z-10"
            >
              <button 
                onClick={() => setShowViewModal(false)} 
                className="absolute top-6 right-6 w-9 h-9 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-900 rounded-xl flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className="text-[11px] font-black tracking-widest uppercase text-slate-400 mb-6">Profile Photo</h3>
              
              <div className="w-48 h-48 rounded-3xl overflow-hidden shadow-md border border-slate-100 flex items-center justify-center bg-slate-900 text-white font-black text-6xl relative mb-6">
                 {currentUserProfilePicture ? (
                   <img src={currentUserProfilePicture} className="w-full h-full object-cover" alt="Profile" />
                 ) : (
                   getInitials(currentUser?.name)
                 )}
              </div>

              <h4 className="text-base font-black text-slate-900 mb-1">
                {formatEmpName(currentUser)}
              </h4>
              <p className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest mb-6">
                {user?.role}
              </p>

              <button
                onClick={() => {
                  setShowViewModal(false);
                  fileInputRef.current?.click();
                }}
                className="w-full py-3.5 bg-slate-900 hover:bg-indigo-600 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                Change Photo
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

const NotificationCenter = ({ onClose }: { onClose: () => void }) => {
  const { user } = useAuth();
  const { data, updateData } = useData();

  const userNotifications = data.notifications
    .filter(n => n.userId === user?.id && !n.read)
    .sort((a, b) => b.date.localeCompare(a.date));

  const markAsRead = async (id: string) => {
    const newNotifications = data.notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    );
    await updateData({ ...data, notifications: newNotifications });
  };

  return (
    <div className="absolute top-12 right-0 w-80 bg-white rounded-3xl border border-slate-200 shadow-2xl z-50 p-6">
       <div className="flex justify-between items-center mb-6">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 font-sans">Notifications</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-full">
             <X className="w-4 h-4 text-slate-400" />
          </button>
       </div>
       <div className="space-y-3 max-h-[400px] overflow-auto pr-2">
          {userNotifications.length === 0 ? (
            <p className="text-[10px] text-center py-10 text-slate-400 font-bold uppercase tracking-widest">No new alerts</p>
          ) : (
            userNotifications.map(n => (
              <div 
                key={n.id} 
                className={cn(
                  "p-4 rounded-2xl border transition-all cursor-pointer",
                  n.read ? "bg-slate-50 border-slate-100 opacity-60" : "bg-indigo-50 border-indigo-100 shadow-sm"
                )}
                onClick={() => markAsRead(n.id)}
              >
                 <div className="flex justify-between items-start mb-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600">{n.type}</span>
                    <span className="text-[8px] font-bold text-slate-400">{format(new Date(n.date), "HH:mm")}</span>
                 </div>
                 <p className="text-[11px] font-bold text-slate-900 mb-1">{n.title}</p>
                 <p className="text-[10px] font-medium text-slate-600 leading-tight">{n.message}</p>
              </div>
            ))
          )}
       </div>
    </div>
  );
};

const Header = () => {
  const { user, switchRole, logout } = useAuth();
  const { data } = useData();
  const [showNotifications, setShowNotifications] = useState(false);
  
  const unreadCount = data.notifications.filter(n => n.userId === user?.id && !n.read).length;

  return (
    <header className="fixed top-0 left-0 xl:left-64 right-0 h-20 bg-[#f0f2f5]/80 backdrop-blur-md z-[50] flex items-center justify-between px-8">
       <div className="xl:hidden flex items-center gap-4">
          <Menu className="w-6 h-6 text-slate-600" />
          <h1 className="font-black uppercase tracking-widest text-xs text-slate-900">INSIGHT<span className="text-indigo-600">360x</span></h1>
       </div>
       <div className="hidden md:flex flex-1 items-center justify-end gap-8">

          <div className="flex items-center gap-4">
             <div className="relative">
                <button 
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center group"
                >
                   <Bell className="w-4 h-4 text-slate-400 group-hover:text-slate-900 transition-colors" />
                   {unreadCount > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white" />}
                </button>
                {showNotifications && <NotificationCenter onClose={() => setShowNotifications(false)} />}
             </div>
             <button 
               onClick={logout}
               className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center group"
             >
                <LogOut className="w-4 h-4 text-slate-400 group-hover:text-slate-900 transition-colors" />
             </button>
          </div>
       </div>
    </header>
  );
};

const parsePrediction = (text: string) => {
  try {
    const eomMatch = text.match(/EOM Candidate:\s*\*\*?([^\*\n]+)\*\*?/i) || text.match(/EOM Candidate:\s*([^\n]+)/i);
    const eoyMatch = text.match(/EOY Candidate:\s*\*\*?([^\*\n]+)\*\*?/i) || text.match(/EOY Candidate:\s*([^\n]+)/i);
    const starMatch = text.match(/High Potential Rising Star:\s*\*\*?([^\*\n]+)\*\*?/i) || text.match(/High Potential Rising Star:\s*([^\n]+)/i);

    let eomWhy = "";
    const eomWhyMatch = text.match(/EOM Candidate:[\s\S]*?(?:Why|Reasoning):\*\*?\s*([\s\S]*?)(?=\*|\n\s*\*|\n\s*-|\n\n|EOY Candidate|High Potential|$)/i);
    if (eomWhyMatch) eomWhy = eomWhyMatch[1].trim();

    let eoyWhy = "";
    const eoyWhyMatch = text.match(/EOY Candidate:[\s\S]*?(?:Why|Reasoning):\*\*?\s*([\s\S]*?)(?=\*|\n\s*\*|\n\s*-|\n\n|High Potential|$)/i);
    if (eoyWhyMatch) eoyWhy = eoyWhyMatch[1].trim();

    let starWhy = "";
    const starWhyMatch = text.match(/High Potential Rising Star:[\s\S]*?(?:Why|Reasoning):\*\*?\s*([\s\S]*?)(?=\*|\n\s*\*|\n\s*-|\n\n|$)/i);
    if (starWhyMatch) starWhy = starWhyMatch[1].trim();

    if (eomMatch && eoyMatch && starMatch) {
      return {
        eom: { name: eomMatch[1].trim(), why: eomWhy },
        eoy: { name: eoyMatch[1].trim(), why: eoyWhy },
        star: { name: starMatch[1].trim(), why: starWhy }
      };
    }
  } catch (e) {
    // Fallback
  }
  return null;
};

const RecognitionView = () => {
  const { data, updateData } = useData();
  const { user } = useAuth();
  const [aiPredicting, setAiPredicting] = useState(false);
  const [prediction, setPrediction] = useState<string | null>(null);

  const leaderboard = [...data.employees].sort((a, b) => b.credits - a.credits);
  const badges = data.badges || [];

  const handleAiPrediction = async () => {
    setAiPredicting(true);
    try {
      const result = await AIService.predictCandidates(data.employees);
      setPrediction(result);
    } catch (e) {
      setPrediction("AI Prediction Engine temporarily offline.");
    } finally {
      setAiPredicting(false);
    }
  };

  return (
    <div className="space-y-6">
       <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-slate-900 uppercase">Honor & Recognition</h1>
        </div>
        <button 
           onClick={handleAiPrediction} 
           disabled={aiPredicting}
           className="px-6 py-3 bg-indigo-600 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl hover:bg-slate-900 transition-all shadow-xl disabled:opacity-50"
        >
          {aiPredicting ? "Analyzing Momentum..." : "Generate AI Prediction"}
        </button>
      </header>

      {prediction && (() => {
         const parsed = parsePrediction(prediction);
         if (parsed) {
           return (
             <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 mb-8">
                <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/10 shrink-0">
                      <Sparkles className="w-4 h-4" />
                   </div>
                   <div>
                      <h2 className="text-sm font-black tracking-widest leading-none uppercase text-slate-900">Neural Forecast Recommendations</h2>
                      <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Calculated by AI Engine</p>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   {/* EOM */}
                   <Card className="h-auto border-amber-100 bg-amber-50/10 shadow-sm relative overflow-hidden group hover:border-amber-300 transition-all">
                      <div className="absolute top-[-10%] right-[-5%] w-24 h-24 bg-amber-500/5 rounded-full blur-xl group-hover:scale-125 transition-transform" />
                      <div className="space-y-4 relative z-10">
                         <div className="flex justify-between items-start">
                            <span className="px-2.5 py-1 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-full text-[8px] font-black uppercase tracking-wider">
                               Employee of the Month
                            </span>
                            <Trophy className="w-5 h-5 text-amber-500" />
                         </div>
                         <div>
                            <h4 className="text-lg font-black text-slate-900">{parsed.eom.name}</h4>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Recommended Candidate</p>
                         </div>
                         <div className="text-xs text-slate-600 font-medium leading-relaxed bg-white/60 p-3.5 rounded-2xl border border-slate-100/50 prose prose-sm prose-slate">
                            <ReactMarkdown>{parsed.eom.why}</ReactMarkdown>
                         </div>
                      </div>
                   </Card>

                   {/* EOY */}
                   <Card className="h-auto border-indigo-100 bg-indigo-50/10 shadow-sm relative overflow-hidden group hover:border-indigo-300 transition-all">
                      <div className="absolute top-[-10%] right-[-5%] w-24 h-24 bg-indigo-500/5 rounded-full blur-xl group-hover:scale-125 transition-transform" />
                      <div className="space-y-4 relative z-10">
                         <div className="flex justify-between items-start">
                            <span className="px-2.5 py-1 bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 rounded-full text-[8px] font-black uppercase tracking-wider">
                               Employee of the Year
                            </span>
                            <Award className="w-5 h-5 text-indigo-500" />
                         </div>
                         <div>
                            <h4 className="text-lg font-black text-slate-900">{parsed.eoy.name}</h4>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Recommended Candidate</p>
                         </div>
                         <div className="text-xs text-slate-600 font-medium leading-relaxed bg-white/60 p-3.5 rounded-2xl border border-slate-100/50 prose prose-sm prose-slate">
                            <ReactMarkdown>{parsed.eoy.why}</ReactMarkdown>
                         </div>
                      </div>
                   </Card>

                   {/* Rising Star */}
                   <Card className="h-auto border-emerald-100 bg-emerald-50/10 shadow-sm relative overflow-hidden group hover:border-emerald-300 transition-all">
                      <div className="absolute top-[-10%] right-[-5%] w-24 h-24 bg-emerald-500/5 rounded-full blur-xl group-hover:scale-125 transition-transform" />
                      <div className="space-y-4 relative z-10">
                         <div className="flex justify-between items-start">
                            <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-full text-[8px] font-black uppercase tracking-wider">
                               Rising Star
                            </span>
                            <Zap className="w-5 h-5 text-emerald-500" />
                         </div>
                         <div>
                            <h4 className="text-lg font-black text-slate-900">{parsed.star.name}</h4>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">High Potential</p>
                         </div>
                         <div className="text-xs text-slate-600 font-medium leading-relaxed bg-white/60 p-3.5 rounded-2xl border border-slate-100/50 prose prose-sm prose-slate">
                            <ReactMarkdown>{parsed.star.why}</ReactMarkdown>
                         </div>
                      </div>
                   </Card>
                </div>
             </motion.div>
           );
         }
         
         // Fallback rendering
         return (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
               <Card title="Neural Recognition Forecast" className="mb-8 border-indigo-200 bg-indigo-50/30">
                  <div className="prose prose-indigo prose-sm max-w-none text-slate-700 font-medium">
                     <ReactMarkdown>{prediction}</ReactMarkdown>
                  </div>
               </Card>
            </motion.div>
         );
      })()}

      <div className="grid grid-cols-12 gap-4">
         {/* Leaderboard Bento Card */}
         <Card className="col-span-12 lg:col-span-12 p-0 overflow-hidden" title="Leaderboard">
            <div className="px-8 pb-8">
               <div className="grid grid-cols-12 gap-4 border-b border-slate-100 pb-4 mb-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                  <div className="col-span-1">Rank</div>
                  <div className="col-span-5">Professional</div>
                  <div className="col-span-3">Designation</div>
                  <div className="col-span-3 text-right">Momentum Score</div>
               </div>
               <div className="space-y-2">
                  {leaderboard.map((emp, i) => (
                    <div key={emp.id} className="grid grid-cols-12 items-center p-4 hover:bg-slate-50 transition-colors rounded-2xl group">
                       <div className="col-span-1">
                          <span className={cn(
                             "w-7 h-7 flex items-center justify-center rounded-lg text-xs font-black",
                             i === 0 ? "bg-amber-100 text-amber-600 ring-2 ring-amber-400" : 
                             i === 1 ? "bg-slate-200 text-slate-600" :
                             i === 2 ? "bg-orange-100 text-orange-600" : "text-slate-400"
                          )}>
                             {i+1}
                          </span>
                       </div>
                       <div className="col-span-5 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-white text-[10px] font-black">
                             {getInitials(emp.name)}
                          </div>
                          <div>
                             <p className="text-sm font-bold text-slate-900">{formatEmpName(emp)}</p>
                             <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{emp.role}</p>
                          </div>
                       </div>
                       <div className="col-span-3">
                          <Badge variant="default">{emp.department}</Badge>
                       </div>
                       <div className="col-span-3 text-right">
                          <span className="text-lg font-black text-slate-900 tabular-nums">{emp.credits}</span>
                       </div>
                    </div>
                  ))}
               </div>
            </div>
         </Card>

         {/* Digital Badges Bento Card */}
         <Card className="col-span-12 lg:col-span-8 p-0 overflow-hidden" title="Digital Achievements Vault">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-8">
               {badges.length === 0 ? (
                 ["Apex Performer", "Security Guardian", "Team Architect", "Legacy Builder", "Sprint Master", "Zen Master"].map((b, i) => (
                    <div key={i} className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-3xl border border-slate-100 hover:border-indigo-200 transition-all group cursor-pointer">
                       <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform mb-4">
                          <Award className="w-8 h-8 text-indigo-600" />
                       </div>
                       <p className="text-[10px] font-black uppercase tracking-widest text-slate-900 text-center">{b}</p>
                       <p className="text-[8px] font-bold text-slate-400 text-center mt-1">LOCKED</p>
                    </div>
                 ))
               ) : (
                  badges.map(b => (
                    <div key={b.id} className="flex flex-col items-center justify-center p-6 bg-white rounded-3xl border border-indigo-100 shadow-sm">
                       <img src={b.icon} alt={b.name} className="w-16 h-16 mb-4" />
                       <p className="text-[10px] font-black uppercase tracking-widest text-slate-900 text-center">{b.name}</p>
                    </div>
                  ))
               )}
            </div>
         </Card>

         {/* Stats Card */}
         <div className="col-span-12 lg:col-span-4 bg-slate-900 rounded-2xl p-10 text-white flex flex-col justify-between shadow-xl">
             <div>
                <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2">Total Points Awarded</p>
                <h2 className="text-6xl font-black tabular-nums">{data.employees.reduce((acc, e) => acc + e.credits, 0)}</h2>
             </div>
             <div className="space-y-4 mt-10">
                <div className="flex justify-between items-center border-b border-white/10 pb-4">
                   <span className="text-[10px] font-bold text-slate-400 uppercase">Badges Issued</span>
                   <span className="font-black text-xl">124</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/10 pb-4">
                   <span className="text-[10px] font-bold text-slate-400 uppercase">Avg Progression</span>
                   <span className="font-black text-xl">78%</span>
                </div>
                <div className="flex justify-between items-center">
                   <span className="text-[10px] font-bold text-slate-400 uppercase">Active Rewards</span>
                   <span className="font-black text-xl text-emerald-400">12</span>
                </div>
             </div>
         </div>
      </div>
    </div>
  );
};

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen bg-[#F5F5F0]">
      <Sidebar />
      <Header />
      <main className="xl:ml-64 pt-24 px-8 pb-12 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={useLocation().pathname}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};

const HierarchyNode = ({ emp, employees, level = 0 }: { emp: Employee; employees: Employee[]; level?: number; key?: string | number }): React.ReactElement => {
  const reports = employees.filter(e => {
    if (emp.role === "HR") {
      const isFirstHR = employees.find(x => x.role === "HR")?.id === emp.id;
      if (isFirstHR) {
        return e.role === "MANAGEMENT" || e.role === "EMPLOYEE";
      }
    }
    return false;
  });

  return (
    <div className="space-y-4">
      <div className={cn(
        "relative p-4 bg-white rounded-2xl border border-slate-200 shadow-sm transition-all hover:border-indigo-300 group ml-auto",
        level > 0 && "before:absolute before:-left-6 before:top-1/2 before:w-6 before:h-px before:bg-slate-200"
      )}>
         <div className="flex items-center gap-4">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-inner shrink-0",
              emp.role === "HR" ? "bg-rose-500" : emp.role === "MANAGEMENT" ? "bg-indigo-600" : "bg-slate-400"
            )}>
              {getInitials(emp.name)}
            </div>
            <div className="min-w-0">
               <h4 className="font-bold text-slate-900 text-sm truncate">{emp.name}</h4>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{emp.role} • {emp.department}</p>
            </div>
         </div>
      </div>
      {reports.length > 0 && (
        <div className="pl-12 border-l-2 border-slate-100 space-y-4">
          {reports.map(r => <HierarchyNode key={r.id} emp={r} employees={employees} level={level + 1} />)}
        </div>
      )}
    </div>
  );
};

interface BulkUserRow {
  name: string;
  email: string;
  empId: string;
  department: string;
  role: string;
  errors: string[];
  warnings: string[];
}

const BulkUploadPanel = ({ 
  onCancel, 
  onSuccess, 
  existingEmployees 
}: { 
  onCancel: () => void; 
  onSuccess: (users: any[]) => void; 
  existingEmployees: Employee[];
}) => {
  const [csvText, setCsvText] = useState("");
  const [parsedRows, setParsedRows] = useState<BulkUserRow[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const handleCSVParse = (text: string) => {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return;
    
    const rows: BulkUserRow[] = [];
    let startIndex = 0;
    if (lines.length > 0) {
      const headerLine = lines[0].toLowerCase();
      if (headerLine.includes("name") || headerLine.includes("email") || headerLine.includes("role")) {
        startIndex = 1;
      }
    }

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const cols = line.split(",").map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length < 4) continue;
      
      const name = cols[0] || "";
      const email = cols[1] || "";
      const empId = cols[2] || "";
      const department = cols[3] || "";
      let roleInput = cols[4] || "EMPLOYEE";
      
      const errors: string[] = [];
      const warnings: string[] = [];
      
      if (!name) errors.push("Missing Name");
      if (!email) {
        errors.push("Missing Email");
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push("Invalid Email format");
      } else if (existingEmployees.some(e => e.email.toLowerCase() === email.toLowerCase())) {
        errors.push("Email already exists");
      }
      
      if (!empId) {
        errors.push("Missing Employee ID");
      } else if (existingEmployees.some(e => e.empId?.toLowerCase() === empId.toLowerCase())) {
        errors.push("Employee ID already exists");
      }

      if (!department) errors.push("Missing Designation");
      
      let finalRole = "EMPLOYEE";
      const uRole = roleInput.toUpperCase();
      if (uRole === "HR" || uRole === "MANAGEMENT" || uRole === "EMPLOYEE") {
        finalRole = uRole;
      } else {
        warnings.push(`Invalid role "${roleInput}" defaulted to EMPLOYEE`);
      }
      
      rows.push({
        name,
        email,
        empId,
        department,
        role: finalRole,
        errors,
        warnings
      });
    }
    setParsedRows(rows);
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvText(text);
      handleCSVParse(text);
    };
    reader.readAsText(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text");
    setCsvText(text);
    handleCSVParse(text);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const hasErrors = parsedRows.some(r => r.errors.length > 0);
  const canSubmit = parsedRows.length > 0 && !hasErrors;

  return (
    <div className="space-y-6">
       <div 
         onDragEnter={handleDrag}
         onDragOver={handleDrag}
         onDragLeave={handleDrag}
         onDrop={handleDrop}
         className={cn(
           "border-2 border-dashed rounded-3xl p-8 text-center transition-all relative",
           dragActive ? "border-indigo-500 bg-indigo-50/50" : "border-slate-200 bg-slate-50/50"
         )}
       >
          <input 
            type="file" 
            accept=".csv"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <div className="space-y-2 pointer-events-none">
             <div className="w-12 h-12 bg-white border border-slate-100 rounded-2xl shadow-sm flex items-center justify-center mx-auto text-slate-400">
                <Upload className="w-5 h-5 text-indigo-600" />
             </div>
             <p className="text-xs font-black uppercase tracking-widest text-slate-700">Drag & Drop CSV File here</p>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">or click to browse from files</p>
          </div>
       </div>

       <div className="space-y-2">
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Or paste CSV content directly</label>
          <textarea 
            placeholder="Name,Email,EmployeeID,Designation,Role&#10;John Doe,john@company.com,EMP001,Engineering,EMPLOYEE&#10;Jane Smith,jane@company.com,EMP002,HR,HR"
            value={csvText}
            onChange={(e) => { setCsvText(e.target.value); handleCSVParse(e.target.value); }}
            onPaste={handlePaste}
            className="w-full h-32 p-4 bg-white border border-slate-200 rounded-2xl text-xs font-mono focus:ring-2 focus:ring-indigo-100"
          />
       </div>

       {parsedRows.length > 0 && (
         <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-bold">Parsed Preview ({parsedRows.length} rows)</h4>
            <div className="max-h-[300px] overflow-y-auto border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
               <table className="w-full text-left border-collapse">
                  <thead>
                     <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-400">
                        <th className="p-4">Name</th>
                        <th className="p-4">Email</th>
                        <th className="p-4">Emp ID</th>
                        <th className="p-4">Designation</th>
                        <th className="p-4">Role</th>
                        <th className="p-4">Status</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                     {parsedRows.map((r, idx) => (
                        <tr key={idx} className="text-xs">
                           <td className="p-4 font-bold text-slate-900">{r.name}</td>
                           <td className="p-4 font-medium text-slate-600">{r.email}</td>
                           <td className="p-4 font-bold text-slate-900 font-mono">{r.empId}</td>
                           <td className="p-4 font-medium text-slate-500">{r.department}</td>
                           <td className="p-4">
                              <Badge variant={r.role === "HR" ? "danger" : r.role === "MANAGEMENT" ? "default" : "default"}>
                                 {r.role}
                              </Badge>
                           </td>
                           <td className="p-4">
                              {r.errors.length > 0 ? (
                                 <span className="text-[10px] font-bold text-rose-500 flex items-center gap-1">
                                    🔴 {r.errors.join(", ")}
                                 </span>
                              ) : r.warnings.length > 0 ? (
                                 <span className="text-[10px] font-bold text-amber-500 flex items-center gap-1">
                                    🟡 {r.warnings.join(", ")}
                                 </span>
                              ) : (
                                 <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-1">
                                    🟢 Ready
                                 </span>
                              )}
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         </div>
       )}

       <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
          <button 
            onClick={onCancel}
            className="px-6 py-2 text-[10px] font-bold uppercase text-slate-500"
          >Cancel</button>
          <button 
            onClick={() => onSuccess(parsedRows)}
            disabled={!canSubmit}
            className="px-6 py-2 bg-slate-900 text-white text-[10px] font-bold uppercase rounded-xl disabled:opacity-20 transition-all"
          >Import Users</button>
       </div>
    </div>
  );
};

// --- Page Wrapper for Organization Settings ---
const SettingsView = () => {
  const { data, updateData, createAuditLog, showToast, reloadData } = useData();
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<"organization" | "point-system">("organization");
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "hierarchy" | "roles" | "audit">("list");
  const [uploadMode, setUploadMode] = useState<"single" | "bulk">("single");
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncSharepoint = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/sync-sharepoint`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      const result = await response.json();
      if (response.ok && result.success) {
        showToast(result.message || "SharePoint sync completed successfully!", "success");
        await reloadData();
      } else {
        showToast(result.error || "SharePoint sync failed.", "error");
      }
    } catch (error: any) {
      showToast(error.message || "Error connecting to server for sync.", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleBulkUsersCreate = async (users: any[]) => {
    let newEmployees = [...data.employees];
    const newLogs = [...data.auditLogs];
    const createdUsers: { emp: Employee, pass: string }[] = [];

    for (const u of users) {
      const newId = `e-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const tempPass = Math.random().toString(36).substring(2, 10) + "!";
      const newEmp: Employee = {
        id: newId,
        name: u.name,
        email: u.email,
        empId: u.empId,
        department: u.department,
        role: u.role as UserRole,
        credits: 500,
        compliance: 100,
        isActive: true,
        password: tempPass,
        isTempPassword: true
      };
      newEmployees.push(newEmp);
      createdUsers.push({ emp: newEmp, pass: tempPass });

      const log = createAuditLog("CREATE", newId, `Created user ${newEmp.name} (Bulk Upload)`, currentUser?.id);
      newLogs.unshift(log);
    }

    await updateData({
      ...data,
      employees: newEmployees,
      auditLogs: [...newLogs]
    });

    showToast(`Bulk upload successful! Dispatching ${createdUsers.length} welcome emails...`, "success");

    for (const item of createdUsers) {
      try {
        await fetch(`${API_BASE_URL}/api/send-temp-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: item.emp.email,
            name: item.emp.name,
            tempPassword: item.pass
          })
        });
      } catch (err) {
        console.error("Failed to send welcome email to:", item.emp.email, err);
      }
    }

    setIsAdding(false);
    setUploadMode("single");
  };

  
  // List View State
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "ALL">("ALL");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [sortField, setSortField] = useState<"name" | "role">("name");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Point System State
  const [pointConfigState, setPointConfigState] = useState(data.pointConfig);

  const savePointConfig = async () => {
    const log = createAuditLog("EDIT", "point-system", `Updated Point System configurations`, currentUser?.id);
    await updateData({ 
      ...data, 
      pointConfig: pointConfigState,
      auditLogs: [log, ...data.auditLogs]
    });
    showToast("Point settings saved successfully.");
  };

  const [form, setForm] = useState<Partial<Employee>>({
    name: "",
    email: "",
    role: "EMPLOYEE",
    department: "",
    managerId: "",
    isActive: true,
    credits: 0,
    compliance: 100,
    empId: "",
    profilePicture: ""
  });

  const handleFormPhotoChange = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const MAX_WIDTH = 128;
        const MAX_HEIGHT = 128;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        setForm(prev => ({ ...prev, profilePicture: dataUrl }));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    let newEmployees = [...data.employees];
    let action: AuditLog["action"];
    let targetId: string;
    let details: string;
    let tempPass = "";
    let isNewUser = false;
    let createdUser: Employee | null = null;

    if (editingId) {
      newEmployees = newEmployees.map(e => e.id === editingId ? { ...e, ...form } as Employee : e);
      action = "EDIT";
      targetId = editingId;
      details = `Updated profile for ${form.name}`;
    } else {
      isNewUser = true;
      const newId = `e-${Date.now()}`;
      tempPass = Math.random().toString(36).substring(2, 10) + "!";
      const newEmp: Employee = {
        ...form,
        id: newId,
        credits: form.credits ?? 0,
        compliance: form.compliance ?? 100,
        isActive: true,
        password: tempPass,
        isTempPassword: true
      } as Employee;
      newEmployees.push(newEmp);
      createdUser = newEmp;
      action = "CREATE";
      targetId = newId;
      details = `Created new user ${form.name}`;
    }

    const log = createAuditLog(action, targetId, details, currentUser?.id);
    await updateData({ 
      ...data, 
      employees: newEmployees,
      auditLogs: [log, ...data.auditLogs]
    });
    
    if (isNewUser && createdUser) {
      try {
        await fetch(`${API_BASE_URL}/api/send-temp-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: createdUser.email,
            name: createdUser.name,
            tempPassword: tempPass
          })
        });
        showToast("User created successfully and welcome credentials email sent!", "success");
      } catch (err) {
        console.error("Failed to send welcome email:", err);
        showToast("User created in database, but welcome email failed to send.", "error");
      }
    } else if (!isNewUser) {
      showToast("User updated successfully!", "success");
    }
    
    setIsAdding(false);
    setEditingId(null);
    setForm({ name: "", email: "", role: "EMPLOYEE", department: "", managerId: "", isActive: true, credits: 0, compliance: 100, empId: "", profilePicture: "" });
  };

  const startEdit = (emp: Employee) => {
    setForm(emp);
    setEditingId(emp.id);
    setIsAdding(true);
  };

  const toggleStatus = async (id: string) => {
    const emp = data.employees.find(e => e.id === id);
    if (!emp) return;
    const newStatus = !emp.isActive;
    const newEmployees = data.employees.map(e => e.id === id ? { ...e, isActive: newStatus } : e);
    const log = createAuditLog("STATUS_CHANGE", id, `${newStatus ? "Activated" : "Deactivated"} user ${emp.name}`, currentUser?.id);
    await updateData({ 
      ...data, 
      employees: newEmployees,
      auditLogs: [log, ...data.auditLogs]
    });
  };

  const handleBulkStatus = async (active: boolean) => {
    const newLogs: AuditLog[] = [];
    const newEmployees = data.employees.map(e => {
      if (selectedIds.includes(e.id)) {
        newLogs.push(createAuditLog("STATUS_CHANGE", e.id, `Bulk ${active ? "activation" : "deactivation"} for ${e.name}`, currentUser?.id));
        return { ...e, isActive: active };
      }
      return e;
    });

    await updateData({ 
      ...data, 
      employees: newEmployees,
      auditLogs: [...newLogs, ...data.auditLogs]
    });
    setSelectedIds([]);
  };

  const handleDeleteUser = async (id: string) => {
    if (id === currentUser?.id) {
      showToast("You cannot delete your own account.", "error");
      return;
    }
    const emp = data.employees.find(e => e.id === id);
    if (!emp) return;
    if (window.confirm(`Are you sure you want to delete user ${emp.name}?`)) {
      const newEmployees = data.employees.filter(e => e.id !== id)
        .map(e => e.managerId === id ? { ...e, managerId: "" } : e);
      
      const newGoals = data.goals.filter(g => g.employeeId !== id);
      const newSubmissions = data.submissions.filter(s => s.employeeId !== id);
      const newAchievements = data.achievements.filter(a => a.employeeId !== id);
      const newAppraisals = data.appraisals.filter(a => a.employeeId !== id);
      const newComplaints = data.complaints.filter(c => c.employeeId !== id);
      const newNotifications = data.notifications.filter(n => n.userId !== id);
      const newMonthlyScores = data.monthlyScores.filter(m => m.employeeId !== id);
      const newManualAdjustments = data.manualAdjustments.filter(m => m.employeeId !== id && m.actorId !== id);
      const newRecognitions = data.recognitions.filter(r => r.employeeId !== id);

      const log = createAuditLog("ROLE_CHANGE", id, `Deleted user ${emp.name}`, currentUser?.id);
      
      await updateData({
        ...data,
        employees: newEmployees,
        goals: newGoals,
        submissions: newSubmissions,
        achievements: newAchievements,
        appraisals: newAppraisals,
        complaints: newComplaints,
        notifications: newNotifications,
        monthlyScores: newMonthlyScores,
        manualAdjustments: newManualAdjustments,
        recognitions: newRecognitions,
        auditLogs: [log, ...data.auditLogs]
      });

      showToast(`User ${emp.name} has been deleted.`, "success");
    }
  };

  const updatePermissions = async (role: UserRole, type: "modules" | "actions", key: string, value: boolean) => {
    const newPermissions = data.permissions.map(p => {
      if (p.role === role) {
        return {
          ...p,
          [type]: { ...p[type], [key]: value }
        };
      }
      return p;
    });
    const log = createAuditLog("PERMISSION_CHANGE", role, `Updated ${type} permissions for ${role}`, currentUser?.id);
    await updateData({ 
      ...data, 
      permissions: newPermissions,
      auditLogs: [log, ...data.auditLogs]
    });
  };

  const filteredEmployees = data.employees
    .filter(e => {
      const matchSearch = e.name.toLowerCase().includes(search.toLowerCase()) || e.email.toLowerCase().includes(search.toLowerCase());
      const matchRole = roleFilter === "ALL" || e.role === roleFilter;
      const matchDept = deptFilter === "ALL" || e.department === deptFilter;
      const matchStatus = statusFilter === "ALL" || (statusFilter === "ACTIVE" ? e.isActive : !e.isActive);
      return matchSearch && matchRole && matchDept && matchStatus;
    })
    .sort((a, b) => {
      if (sortField === "name") return a.name.localeCompare(b.name);
      return a.role.localeCompare(b.role);
    });

  const departments = Array.from(new Set(data.employees.map(e => e.department)));
  const topLevel = data.employees.filter(e => e.role === "HR");

  return (
    <div className="space-y-6">
       <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 uppercase">Settings</h1>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-1">Configure Organization & Logic</p>
        </div>
        <div className="flex bg-white p-1 rounded-2xl border border-slate-200">
           <button 
            onClick={() => setActiveTab("organization")}
            className={cn("px-6 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all", activeTab === "organization" ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-900")}
           >Organization</button>
           <button 
            onClick={() => setActiveTab("point-system")}
            className={cn("px-6 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all", activeTab === "point-system" ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-900")}
           >Point System</button>
        </div>
      </header>

      {activeTab === "organization" ? (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              { id: "list", label: "Registry", icon: Users },
              { id: "hierarchy", label: "Hierarchy", icon: GitGraph },
              { id: "roles", label: "Permissions", icon: ShieldCheck },
              { id: "audit", label: "Audit Log", icon: History }
            ].map(v => (
              <button 
                key={v.id}
                onClick={() => setView(v.id as any)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all shadow-sm border",
                  view === v.id ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:text-slate-900"
                )}
              >
                <v.icon className="w-3.5 h-3.5" />
                {v.label}
              </button>
            ))}
            <button 
              onClick={handleSyncSharepoint}
              disabled={isSyncing}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white font-bold uppercase text-[10px] tracking-widest rounded-xl hover:bg-emerald-700 transition-all shadow-lg ml-auto disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isSyncing && "animate-spin")} />
              {isSyncing ? "Syncing..." : "Sync SharePoint"}
            </button>
            <button 
              onClick={() => setIsAdding(true)}
              className="px-6 py-2.5 bg-indigo-600 text-white font-bold uppercase text-[10px] tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-lg"
            >Add User</button>
          </div>

          {isAdding && (
            <Card title={editingId ? "Edit User" : "Add New User"} className="mb-8 border-indigo-100">
               {!editingId && (
                 <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200/50 mb-6 max-w-[280px]">
                    <button
                      onClick={() => setUploadMode("single")}
                      className={cn("flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all", uploadMode === "single" ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-900")}
                    >Single User</button>
                    <button
                      onClick={() => setUploadMode("bulk")}
                      className={cn("flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all", uploadMode === "bulk" ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-900")}
                    >Bulk Upload</button>
                 </div>
               )}

               {uploadMode === "bulk" && !editingId ? (
                 <BulkUploadPanel 
                   onCancel={() => { setIsAdding(false); setUploadMode("single"); }} 
                   onSuccess={(users) => handleBulkUsersCreate(users)}
                   existingEmployees={data.employees}
                 />
               ) : (
                  <>
                    <div className="flex flex-col md:flex-row gap-8 items-start mb-6">
                       {/* Profile Picture Box */}
                       <div className="flex flex-col items-center gap-3 shrink-0">
                          <label className="text-[10px] font-bold uppercase text-slate-400">Profile Photo</label>
                          <div className="w-24 h-24 rounded-3xl bg-slate-900 border border-slate-200 flex items-center justify-center text-white font-black text-3xl overflow-hidden relative group cursor-pointer shadow-md">
                             {form.profilePicture ? (
                               <img src={form.profilePicture} className="w-full h-full object-cover" alt="Preview" />
                             ) : (
                               getInitials(form.name)
                             )}
                             <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                               <Camera className="w-6 h-6 text-white" />
                             </div>
                             <input 
                               type="file" 
                               accept="image/*" 
                               onChange={(e) => {
                                 const file = e.target.files?.[0];
                                 if (file) handleFormPhotoChange(file);
                               }} 
                               className="absolute inset-0 opacity-0 cursor-pointer" 
                             />
                          </div>
                          {form.profilePicture && (
                            <button
                              type="button"
                              onClick={() => setForm({ ...form, profilePicture: "" })}
                              className="text-[9px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-700 transition-colors"
                            >
                              Remove Photo
                            </button>
                          )}
                       </div>

                       <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
                          <div className="space-y-2">
                             <label className="text-[10px] font-bold uppercase text-slate-400">Full Name</label>
                             <input 
                               type="text" value={form.name}
                               className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                               onChange={(e) => setForm({...form, name: e.target.value})}
                             />
                          </div>
                          <div className="space-y-2">
                             <label className="text-[10px] font-bold uppercase text-slate-400">Employee ID</label>
                             <input 
                               type="text" value={form.empId || ""}
                               placeholder="e.g. EMP001"
                               className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                               onChange={(e) => setForm({...form, empId: e.target.value})}
                             />
                          </div>
                          <div className="space-y-2">
                             <label className="text-[10px] font-bold uppercase text-slate-400">Email Address</label>
                             <input 
                               type="email" value={form.email}
                               className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                               onChange={(e) => setForm({...form, email: e.target.value})}
                             />
                          </div>
                          <div className="space-y-2">
                             <label className="text-[10px] font-bold uppercase text-slate-400">Designation</label>
                             <input 
                               type="text" value={form.department}
                               className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                               onChange={(e) => setForm({...form, department: e.target.value})}
                             />
                          </div>
                          <div className="space-y-2">
                             <label className="text-[10px] font-bold uppercase text-slate-400">Role</label>
                             <select 
                               value={form.role}
                               className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                               onChange={(e) => setForm({...form, role: e.target.value as UserRole})}
                             >
                               <option value="EMPLOYEE">Employee</option>
                               <option value="HR">HR</option>
                               <option value="MANAGEMENT">Management</option>
                             </select>
                          </div>
                       </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-100">
                       <button 
                         onClick={() => { setIsAdding(false); setEditingId(null); }}
                         className="px-6 py-2 text-[10px] font-bold uppercase text-slate-500"
                       >Cancel</button>
                       <button 
                         onClick={handleSubmit}
                         className="px-6 py-2 bg-slate-900 text-white text-[10px] font-bold uppercase rounded-xl"
                       >{editingId ? "Update User" : "Create User"}</button>
                    </div>
                  </>
               )}
            </Card>
          )}

          {view === "list" && (
            <div className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-3 bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
                  <div className="relative col-span-1 md:col-span-2">
                     <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                     <input 
                      type="text" placeholder="Search users..."
                      className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-[11px] font-bold focus:ring-2 focus:ring-indigo-100"
                      value={search} onChange={(e) => setSearch(e.target.value)}
                     />
                  </div>
                  <select className="px-4 py-3 bg-slate-50 border-none rounded-2xl text-[11px] font-bold uppercase tracking-widest text-slate-500 font-sans"
                    value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as any)}>
                     <option value="ALL">All Roles</option>
                     <option value="EMPLOYEE">Employees</option>
                     <option value="HR">HR</option>
                     <option value="MANAGEMENT">Management</option>
                  </select>
                  <select className="px-4 py-3 bg-slate-50 border-none rounded-2xl text-[11px] font-bold uppercase tracking-widest text-slate-500 font-sans"
                    value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
                     <option value="ALL">All Status</option>
                     <option value="ACTIVE">Active Only</option>
                     <option value="INACTIVE">Inactive Only</option>
                  </select>
                  <select className="px-4 py-3 bg-slate-50 border-none rounded-2xl text-[11px] font-bold uppercase tracking-widest text-slate-500 font-sans"
                    value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
                     <option value="ALL">All Designations</option>
                     {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <button 
                    onClick={() => setSortField(sortField === "name" ? "role" : "name")}
                    className="flex items-center justify-between px-4 py-3 bg-slate-50 border-none rounded-2xl text-[11px] font-bold uppercase tracking-widest text-slate-500"
                  >
                    Sort By: {sortField}
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
               </div>

               {selectedIds.length > 0 && (
                 <motion.div 
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-4 bg-indigo-600 text-white rounded-3xl shadow-lg border border-indigo-500"
                 >
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] font-black uppercase tracking-widest">{selectedIds.length} users selected</span>
                      <div className="h-4 w-px bg-white/20" />
                      <div className="flex gap-2">
                        <button onClick={() => handleBulkStatus(true)} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all">Activate All</button>
                        <button onClick={() => handleBulkStatus(false)} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all">Deactivate All</button>
                      </div>
                    </div>
                    <button onClick={() => setSelectedIds([])} className="p-2 hover:bg-white/10 rounded-full">
                      <X className="w-4 h-4" />
                    </button>
                 </motion.div>
               )}

               <div className="space-y-3">
                  {filteredEmployees.map(emp => (
                    <div key={emp.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm px-6 py-4 flex items-center justify-between group hover:shadow-md transition-shadow">
                       <div className="flex items-center gap-4">
                          <button 
                            onClick={() => setSelectedIds(prev => prev.includes(emp.id) ? prev.filter(i => i !== emp.id) : [...prev, emp.id])}
                            className={cn("p-2 rounded-xl transition-all", selectedIds.includes(emp.id) ? "text-indigo-600" : "text-slate-300 hover:text-slate-400")}
                          >
                             {selectedIds.includes(emp.id) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                          </button>
                          <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-white shadow-inner shrink-0", 
                            emp.role === "HR" ? "bg-rose-500" : "bg-slate-400"
                          )}>
                             {getInitials(emp.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                             <h4 className="font-bold text-slate-900 flex items-center gap-2 truncate">
                               {emp.name}
                               {emp.empId && (
                                 <span className="text-[10px] bg-slate-100 text-slate-500 font-mono px-2 py-0.5 rounded-lg border border-slate-200/50">
                                   {emp.empId}
                                 </span>
                               )}
                               {!emp.isActive && <Badge variant="danger">Inactive</Badge>}
                             </h4>
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
                               {emp.role} • {emp.department}
                             </p>
                             <p className="text-[9px] font-medium text-slate-400 truncate">{emp.email}</p>
                          </div>
                       </div>
                       <div className="flex gap-2">
                          <button 
                           onClick={() => startEdit(emp)}
                           className="p-3 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700 rounded-xl border border-indigo-100 transition-colors"
                           title="Edit User"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                           onClick={() => toggleStatus(emp.id)}
                           className={cn(
                             "p-3 rounded-xl border transition-colors",
                             emp.isActive ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-rose-50 text-rose-600 border-rose-100"
                           )}
                          >
                            <Zap className="w-4 h-4" />
                          </button>
                          <button 
                           onClick={() => handleDeleteUser(emp.id)}
                           className="p-3 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 rounded-xl border border-rose-100 transition-colors"
                           title="Delete User"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                       </div>
                    </div>
                  ))}
                  {filteredEmployees.length === 0 && (
                    <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
                       <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No users found matching filters</p>
                    </div>
                  )}
               </div>
            </div>
          )}

          {view === "hierarchy" && (
            <div className="bg-white p-12 rounded-3xl border border-slate-200 shadow-sm overflow-x-auto min-h-[600px]">
               <div className="max-w-fit mx-auto space-y-12">
                  {topLevel.map(manager => (
                    <HierarchyNode key={manager.id} emp={manager} employees={data.employees} />
                  ))}
               </div>
            </div>
          )}

          {view === "roles" && (
            <div className="space-y-6">
               {(["EMPLOYEE", "HR"] as UserRole[]).map(role => {
                 const perm = data.permissions.find(p => p.role === role);
                 if (!perm) return null;
                 return (
                   <Card key={role} title={`${role} Permissions`} className="overflow-hidden">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         <div>
                            <h5 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-6">Module Access</h5>
                            <div className="space-y-3">
                               {Object.entries(perm.modules).map(([mod, state]) => (
                                 <div key={mod} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-widest">{mod}</span>
                                    <button 
                                      onClick={() => updatePermissions(role, "modules", mod, !state)}
                                      className={cn("w-10 h-6 rounded-full transition-all relative", state ? "bg-indigo-600" : "bg-slate-300")}
                                    >
                                       <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all", state ? "left-5" : "left-1")} />
                                    </button>
                                 </div>
                               ))}
                            </div>
                         </div>
                         <div>
                            <h5 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-6">Action Privileges</h5>
                            <div className="space-y-3">
                               {Object.entries(perm.actions).map(([act, state]) => (
                                 <div key={act} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-widest">{act.replace(/([A-Z])/g, ' $1')}</span>
                                    <button 
                                      onClick={() => updatePermissions(role, "actions", act, !state)}
                                      className={cn("w-10 h-6 rounded-full transition-all relative", state ? "bg-indigo-600" : "bg-slate-300")}
                                    >
                                       <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all", state ? "left-5" : "left-1")} />
                                    </button>
                                 </div>
                               ))}
                            </div>
                         </div>
                      </div>
                   </Card>
                 );
               })}
            </div>
          )}

          {view === "audit" && (
            <div className="space-y-4">
               <Card title="Activity Audit Trail">
                  <div className="overflow-x-auto">
                     <table className="w-full text-left">
                        <thead>
                           <tr className="border-b border-slate-100">
                              <th className="pb-4 text-[9px] font-black uppercase tracking-widest text-slate-400">Timestamp</th>
                              <th className="pb-4 text-[9px] font-black uppercase tracking-widest text-slate-400">Actor</th>
                              <th className="pb-4 text-[9px] font-black uppercase tracking-widest text-slate-400">Action</th>
                              <th className="pb-4 text-[9px] font-black uppercase tracking-widest text-slate-400">Details</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                           {data.auditLogs.map(log => {
                             const actor = data.employees.find(e => e.id === log.actorId);
                             return (
                               <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="py-4 text-[11px] font-medium text-slate-500 whitespace-nowrap">
                                     {format(new Date(log.timestamp), "MMM dd, HH:mm:ss")}
                                  </td>
                                  <td className="py-4">
                                     <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-lg bg-slate-200 flex items-center justify-center text-[10px] font-bold">{getInitials(actor?.name)}</div>
                                        <span className="text-[11px] font-bold text-slate-700">{actor?.name || "System"}</span>
                                     </div>
                                  </td>
                                  <td className="py-4">
                                     <Badge variant={
                                       log.action === "CREATE" ? "success" : 
                                       log.action === "STATUS_CHANGE" ? "warning" : "default"
                                     }>{log.action}</Badge>
                                  </td>
                                  <td className="py-4 text-[11px] font-medium text-slate-600">
                                     {log.details}
                                  </td>
                               </tr>
                             );
                           })}
                           {data.auditLogs.length === 0 && (
                             <tr>
                                <td colSpan={4} className="py-20 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">No activity recorded yet</td>
                             </tr>
                           )}
                        </tbody>
                     </table>
                  </div>
               </Card>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
           <Card title="Point Allocation Engine" className="max-w-2xl overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
              <div className="space-y-8 relative z-10">
                 <div className="space-y-4">
                    <div className="flex items-center justify-between">
                       <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Weekly Submission Merit</label>
                       <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black">ACTIVE RULE</span>
                    </div>
                    <div className="flex items-center gap-6">
                       <input 
                         type="number" 
                         value={pointConfigState.weeklySubmission}
                         onChange={(e) => setPointConfigState({...pointConfigState, weeklySubmission: parseInt(e.target.value) || 0})}
                         className="w-32 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-2xl font-black text-slate-900 focus:ring-4 focus:ring-indigo-100 transition-all"
                       />
                       <div>
                          <p className="text-sm font-bold text-slate-700">Points per approved weekly report</p>
                          <p className="text-[10px] text-slate-400 font-medium">Applied instantly upon manager validation.</p>
                       </div>
                    </div>
                 </div>

                 <div className="space-y-4 border-t border-slate-100 pt-8">
                    <div className="flex items-center justify-between">
                       <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Individual Achievement Points</label>
                       <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black">AUTO-CALC</span>
                    </div>
                    <div className="flex items-center gap-6">
                       <input 
                         type="number" 
                         value={pointConfigState.achievement}
                         onChange={(e) => setPointConfigState({...pointConfigState, achievement: parseInt(e.target.value) || 0})}
                         className="w-32 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-2xl font-black text-slate-900 focus:ring-4 focus:ring-indigo-100 transition-all"
                       />
                       <div>
                          <p className="text-sm font-bold text-slate-700">Points per milestone/innovation entry</p>
                          <p className="text-[10px] text-slate-400 font-medium">Verified achievements contribute to monthly velocity.</p>
                       </div>
                    </div>
                 </div>

                 <div className="space-y-4 border-t border-slate-100 pt-8">
                    <div className="flex items-center justify-between">
                       <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Professional Certification weightage</label>
                       <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-black">HIGH IMPACT</span>
                    </div>
                    <div className="flex items-center gap-6">
                       <input 
                         type="number" 
                         value={pointConfigState.certification}
                         onChange={(e) => setPointConfigState({...pointConfigState, certification: parseInt(e.target.value) || 0})}
                         className="w-32 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-2xl font-black text-slate-900 focus:ring-4 focus:ring-indigo-100 transition-all"
                       />
                       <div>
                          <p className="text-sm font-bold text-slate-700">Points for validated external certifications</p>
                          <p className="text-[10px] text-slate-400 font-medium">Linked to technical growth projections.</p>
                       </div>
                    </div>
                 </div>

                 <div className="pt-10 flex justify-end">
                    <button 
                      onClick={savePointConfig}
                      className="group flex items-center gap-3 px-10 py-4 bg-slate-900 text-white rounded-[1.5rem] hover:bg-slate-800 transition-all shadow-xl"
                    >
                       <Zap className="w-4 h-4 text-amber-400 group-hover:scale-125 transition-transform" />
                       <span className="text-[11px] font-black uppercase tracking-[0.2em]">Save Point Settings</span>
                    </button>
                 </div>
              </div>
           </Card>
        </div>
      )}
    </div>
  );
};

interface ReviewComment {
  id: string;
  text: string;
  date: string;
}

const parseManagerComments = (rawReview: string | undefined | null): ReviewComment[] => {
  if (!rawReview) return [];
  const trimmed = rawReview.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item: any, index: number) => {
          if (typeof item === 'object' && item !== null && typeof item.text === 'string') {
            return {
              id: item.id || `comment-${index}-${Date.now()}`,
              text: item.text,
              date: item.date || new Date().toISOString()
            };
          }
          return {
            id: `comment-${index}-${Date.now()}`,
            text: String(item),
            date: new Date().toISOString()
          };
        });
      }
    } catch (e) {
      // Fallback
    }
  }
  return [{
    id: `legacy-${Date.now()}`,
    text: rawReview,
    date: new Date().toISOString()
  }];
};

const PerformanceReviewView = () => {
  const { user } = useAuth();
  const { data, updateData, showToast, createAuditLog } = useData();
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [reviewType, setReviewType] = useState<"Monthly" | "Yearly" | null>(null);
  const [managerComment, setManagerComment] = useState("");

  const isHR = user?.role === "HR";
  const isManagement = user?.role === "MANAGEMENT";
  const canSeeAllEmployees = isHR || isManagement;
  const canEditReview = isHR;

  const currentEmp = selectedEmp ? data.employees.find(e => e.id === selectedEmp.id) || selectedEmp : null;
  
  const team = data.employees;

  const [searchQuery, setSearchQuery] = useState("");

  const filteredTeam = team.filter(emp => 
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    emp.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentIndex = selectedEmp ? team.findIndex(e => e.id === selectedEmp.id) : -1;

  const navigateEmployee = (direction: "prev" | "next") => {
    if (currentIndex === -1) return;
    let nextIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0) nextIndex = team.length - 1;
    if (nextIndex >= team.length) nextIndex = 0;
    setSelectedEmp(team[nextIndex]);
  };
 
  const calculatePerformance = (empId: string) => {
    // Determine the range to calculate for (Active Cycle if exists, else everything)
    const activeMonthlyCycle = data.appraisalCycles.find(c => c.type === "Monthly" && c.status === "Active");
    const activeYearlyCycle = data.appraisalCycles.find(c => c.type === "Yearly" && c.status === "Active");
    
    // Default to a very wide range if no active cycle, but typically Review should focus on current cycle
    const cycle = (reviewType === "Yearly" ? activeYearlyCycle : activeMonthlyCycle);
    
    const events = cycle 
      ? getPerformanceEvents(data, empId, parseLocalDate(cycle.startDate), parseLocalDate(cycle.endDate))
      : getPerformanceEvents(data, empId, new Date("2000-01-01"), new Date("2100-01-01"));

    const meritPoints = events.reduce((acc, e) => acc + (e.impact > 0 ? e.impact : 0), 0);
    const demeritPoints = events.reduce((acc, e) => acc + (e.impact < 0 ? Math.abs(e.impact) : 0), 0);
    
    return {
      merit: Math.round(meritPoints),
      demerit: demeritPoints,
      total: Math.round(meritPoints - demeritPoints),
      goalsCount: events.filter(e => e.type === 'goal').length,
      compCount: events.filter(e => e.type === 'complaint').length,
      events,
      goals: data.goals.filter(g => g.employeeId === empId)
    };
  };

  const activeCycle = data.appraisalCycles.find(c => c.status === "Active" && (reviewType === "Yearly" ? c.type === "Yearly" : c.type === "Monthly"));
  const appraisal = selectedEmp && activeCycle ? data.appraisals.find(a => a.employeeId === selectedEmp.id && a.cycleId === activeCycle.id) : null;

  useEffect(() => {
    setManagerComment("");
  }, [appraisal, selectedEmp]);

  const saveReview = async () => {
    if (!selectedEmp || !activeCycle) return;
    if (!managerComment.trim()) {
      showToast("Please enter a review comment.", "error");
      return;
    }
    
    let newAppraisals = [...data.appraisals];
    const existingIndex = data.appraisals.findIndex(a => a.employeeId === selectedEmp.id && a.cycleId === activeCycle.id);
    
    const stats = calculatePerformance(selectedEmp.id);
    const existingAppraisal = existingIndex >= 0 ? data.appraisals[existingIndex] : null;
    const existingComments = parseManagerComments(existingAppraisal?.managerReview);
    
    const newCommentObj: ReviewComment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: managerComment.trim(),
      date: new Date().toISOString()
    };
    
    const updatedComments = [...existingComments, newCommentObj];
    const serializedComments = JSON.stringify(updatedComments);
    
    const appraisalData: Appraisal = existingAppraisal 
      ? { ...existingAppraisal, managerReview: serializedComments, finalScore: stats.total }
      : {
          id: `appr-${Date.now()}`,
          employeeId: selectedEmp.id,
          cycleId: activeCycle.id,
          step: "Manager",
          managerReview: serializedComments,
          promotionRecommended: false,
          finalScore: stats.total
        };

    if (existingIndex >= 0) {
      newAppraisals[existingIndex] = appraisalData;
    } else {
      newAppraisals.push(appraisalData);
    }

    const log = createAuditLog("EDIT", selectedEmp.id, `Saved performance review comment for employee: ${selectedEmp.name} in cycle: ${activeCycle.name}`, user?.id);
    await updateData({
      ...data,
      appraisals: newAppraisals,
      auditLogs: [log, ...data.auditLogs]
    });
    setManagerComment("");
    showToast("Review comments saved successfully.");
  };



  if (currentEmp && reviewType) {
    const stats = calculatePerformance(currentEmp.id);
    return (
      <div className="space-y-6">
         <div className="flex justify-between items-center mb-6">
            <button 
              onClick={() => { setSelectedEmp(null); setReviewType(null); }}
              className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 hover:text-slate-900 transition-colors"
            >
               <X className="w-4 h-4" /> Cancel Review
            </button>
            <div className="flex gap-2">
               <button 
                 onClick={() => navigateEmployee("prev")}
                 className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-500"
               >
                  <ChevronRight className="w-4 h-4 rotate-180" />
               </button>
               <button 
                 onClick={() => navigateEmployee("next")}
                 className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-500"
               >
                  <ChevronRight className="w-4 h-4" />
               </button>
            </div>
         </div>
         
         <header className="mb-8">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 uppercase">
              {reviewType} Forecast: {currentEmp.name}
            </h1>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-1">
              Data-Driven Projections • {currentEmp.department}
            </p>
         </header>

         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
               <Card title="Analysis Factors" className="h-auto">
                  <div className="space-y-4 max-h-[340px] overflow-y-auto pr-2 custom-scrollbar">
                     {stats.events.map((e, index) => {
                       const isMerit = e.impact >= 0;
                       let dateLabel = "";
                       try {
                         dateLabel = format(parseLocalDate(e.date), "MMM dd, yyyy");
                       } catch (err) {
                         dateLabel = e.date;
                       }
                       return (
                         <div key={index} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="flex-1">
                               <p className="text-xs font-bold text-slate-900">{e.title}</p>
                               <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                 {e.type} • {dateLabel}
                               </p>
                            </div>
                            <div className="text-right ml-6">
                               <p className={cn("text-[10px] font-black", isMerit ? "text-emerald-600" : "text-rose-600")}>
                                 {isMerit ? "+" : ""}{e.impact} pts
                               </p>
                               <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                                 {isMerit ? "Projected Merit" : "Projected Demerit"}
                               </p>
                            </div>
                         </div>
                       );
                     })}
                     {stats.events.length === 0 && <p className="text-xs text-slate-400 italic">No appraisal events recorded for this cycle.</p>}
                  </div>
               </Card>

               {canEditReview && (
                 <Card title="Manager Review Comments" className="border-indigo-100 h-auto">
                    <div className="space-y-4">
                       <div className="flex justify-between items-center">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Feedback Input</p>
                       </div>
                       <textarea 
                         value={managerComment}
                         onChange={(e) => setManagerComment(e.target.value)}
                         placeholder="Provide qualitative feedback, achievements, and improvement areas..."
                         className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-indigo-100 transition-all"
                       />
                       <div className="flex justify-end">
                          <button 
                            onClick={saveReview}
                            className="px-6 py-2 bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-600/20"
                          >
                             Save Review
                          </button>
                       </div>
                    </div>
                 </Card>
               )}

               {/* Appraisal Feedback History */}
               <Card title="Appraisal Feedback History" className="h-auto">
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                     {(() => {
                        const pastAppraisals = data.appraisals.filter(a => a.employeeId === currentEmp.id && a.managerReview);
                        let historyReviews = pastAppraisals
                          .map(a => {
                            const c = data.appraisalCycles.find(cy => cy.id === a.cycleId);
                            return { appraisal: a, cycle: c };
                          })
                          .filter(item => item.cycle !== undefined)
                          .sort((a, b) => (b.cycle?.startDate || "").localeCompare(a.cycle?.startDate || ""));

                        if (reviewType === "Monthly") {
                          historyReviews = historyReviews.filter(item => item.cycle?.type === "Monthly");
                        } else if (reviewType === "Yearly") {
                          const activeYearlyCycle = data.appraisalCycles.find(c => c.type === "Yearly" && c.status === "Active");
                          if (activeYearlyCycle) {
                            const start = parseLocalDate(activeYearlyCycle.startDate);
                            const end = parseLocalDate(activeYearlyCycle.endDate);
                            historyReviews = historyReviews.filter(item => {
                              if (!item.cycle) return false;
                              const cycleStart = parseLocalDate(item.cycle.startDate);
                              return item.cycle.type === "Monthly" && cycleStart >= start && cycleStart <= end;
                            });
                          }
                        }

                        return (
                           <>
                              {historyReviews.map((item, idx) => {
                                const comments = parseManagerComments(item.appraisal.managerReview);
                                return (
                                  <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                                     <div className="flex justify-between items-start">
                                        <div>
                                           <p className="text-xs font-bold text-slate-900">{item.cycle?.name}</p>
                                           <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                             {item.cycle?.type} Appraisal
                                           </p>
                                        </div>
                                        <div className="text-right">
                                           <Badge variant="default">{item.appraisal.finalScore !== undefined ? `${item.appraisal.finalScore} pts` : "No Score"}</Badge>
                                        </div>
                                     </div>
                                     <div className="space-y-2">
                                        {comments.map((comm) => {
                                           let dateLabel = "";
                                           try {
                                              dateLabel = format(new Date(comm.date), "MMM dd, yyyy hh:mm a");
                                           } catch (err) {
                                              dateLabel = "";
                                           }
                                           return (
                                              <div key={comm.id} className="bg-white p-3 rounded-xl border border-slate-100 leading-relaxed shadow-sm">
                                                 <p className="text-xs text-slate-600 font-medium whitespace-pre-wrap">
                                                    {comm.text}
                                                 </p>
                                                 {dateLabel && (
                                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1 text-right">
                                                       {dateLabel}
                                                    </p>
                                                 )}
                                              </div>
                                           );
                                        })}
                                     </div>
                                  </div>
                                );
                              })}
                              {historyReviews.length === 0 && (
                                 <p className="text-xs text-slate-400 italic">No previous reviews recorded for this period.</p>
                              )}
                           </>
                        );
                     })()}
                  </div>
               </Card>


            </div>

            <div className="space-y-6">
               <Card title="Calculated Projection" className="bg-slate-900 text-white border-none h-auto">
                  <div className="text-center py-4">
                     <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2">{reviewType === "Monthly" ? "Monthly Score" : "Yearly Score"}</p>
                     <h2 className="text-5xl font-black tabular-nums">
                       {stats.total}
                     </h2>
                     <div className="mt-4 flex justify-center">
                        <Badge variant="success">High Confidence</Badge>
                     </div>
                  </div>
                  <div className="mt-6 space-y-3 pt-6 border-t border-white/10">
                     <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                        <span className="text-slate-400">Merits</span>
                        <span className="text-emerald-400">+{stats.merit}</span>
                     </div>
                     <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                        <span className="text-slate-400">Demerits</span>
                        <span className="text-rose-400">-{stats.demerit}</span>
                     </div>
                  </div>
               </Card>
               
               <Card title="Recommendations" className="h-auto">
                  <ul className="space-y-4">
                     <li className="flex items-start gap-3">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-slate-600 font-medium">Continue current goal trajectory.</p>
                     </li>
                     <li className="flex items-start gap-3">
                        <AlertCircle className={cn("w-4 h-4 mt-0.5 shrink-0", stats.compCount > 0 ? "text-amber-500" : "text-slate-200")} />
                        <p className="text-xs text-slate-600 font-medium">
                          {stats.compCount > 0 ? `Monitor ${stats.compCount} pending infractions.` : "No behavioral infractions recorded."}
                        </p>
                     </li>
                  </ul>
               </Card>
            </div>
         </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
       <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
             <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 uppercase">Performance Review</h1>
             <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-1">Team Analytics • Merit & Demerit Audit</p>
          </div>
          <div className="relative w-full md:w-72">
             <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
             <input 
               type="text"
               placeholder="Search employees..."
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="w-full pl-12 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-100 transition-all shadow-sm font-sans"
             />
          </div>
       </div>

       <div className="grid grid-cols-1 gap-4">
          {filteredTeam.map(emp => {
            const stats = calculatePerformance(emp.id);
            return (
              <Card key={emp.id} className="hover:shadow-md transition-shadow">
                 <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                       <div className="w-16 h-16 bg-slate-900 rounded-[2rem] flex items-center justify-center text-white font-black text-xl shadow-xl">
                          {getInitials(emp.name)}
                       </div>
                       <div>
                          <h4 className="text-lg font-black text-slate-900">{emp.name}</h4>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{emp.role} • {emp.department}</p>
                          <div className="flex gap-2 mt-2">
                             <Badge variant="success">{stats.goalsCount} Goals</Badge>
                             <Badge variant="danger">{stats.compCount} Infractions</Badge>
                          </div>
                       </div>
                    </div>

                    <div className="flex gap-4 md:gap-12">
                       <div className="text-center">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Merits</p>
                          <p className="text-xl font-black text-emerald-600">+{stats.merit}</p>
                       </div>
                       <div className="text-center">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Demerits</p>
                          <p className="text-xl font-black text-rose-600">-{stats.demerit}</p>
                       </div>
                       <div className="h-12 w-px bg-slate-100 hidden md:block"></div>
                       <div className="text-center">
                          <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-1">Overall Score</p>
                          <p className="text-2xl font-black text-slate-900">{stats.total}</p>
                       </div>
                    </div>

                    <div className="flex flex-col gap-2">
                       <button 
                        onClick={() => { setSelectedEmp(emp); setReviewType("Monthly"); }}
                        className="px-6 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-all font-sans"
                       >
                         Review Month
                       </button>
                       <button 
                        onClick={() => { setSelectedEmp(emp); setReviewType("Yearly"); }}
                        className="px-6 py-2 border-2 border-slate-100 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-all font-sans"
                       >
                         Yearly Forecast
                       </button>
                    </div>
                 </div>
              </Card>
            );
          })}
          {filteredTeam.length === 0 && (
             <p className="text-xs text-slate-400 italic py-8 text-center bg-white rounded-2xl border border-slate-200">No employees match your search.</p>
          )}
       </div>
    </div>
  );
};

const ComingSoon = ({ title }: { title: string }) => (
  <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
     <div className="w-20 h-20 bg-[#141414]/5 flex items-center justify-center rounded-full border border-dashed border-[#141414]">
        <Settings className="w-10 h-10 opacity-20 animate-spin-slow" />
     </div>
     <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2 uppercase">{title}</h1>
        <p className="text-sm opacity-50 font-mono uppercase tracking-widest max-w-sm mx-auto">
          This module is currently in standard development cycle. Expected completion: Q3 2026.
        </p>
      </div>
      <Link to="/" className="text-xs font-bold uppercase tracking-widest underline underline-offset-4 hover:opacity-70">Return to Mission Control</Link>
  </div>
);

const Login = () => {
  const { data, updateData, createAuditLog } = useData();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [view, setView] = useState<'login' | 'force_change' | 'forgot' | 'otp'>('login');
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [tempUser, setTempUser] = useState<Employee | null>(null);
  const [successMsg, setSuccessMsg] = useState("");

  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);

    setTimeout(async () => {
      const trimmedEmail = email.trim();
      const matchedEmp = data.employees.find(emp => emp.email.toLowerCase() === trimmedEmail.toLowerCase());

      if (matchedEmp && matchedEmp.password === password) {
        if (matchedEmp.isTempPassword) {
          setTempUser(matchedEmp);
          setView('force_change');
          setLoading(false);
        } else {
          const log = createAuditLog("STATUS_CHANGE", matchedEmp.id, `User logged in: ${matchedEmp.name}`, matchedEmp.id);
          await updateData({
            ...data,
            auditLogs: [log, ...data.auditLogs]
          }, true);
          login(matchedEmp);
        }
      } else {
        setError("Invalid email or password.");
        setLoading(false);
      }
    }, 800);
  };

  const handleForceChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    if (!newPassword) {
      setError("Please enter a new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword === tempUser?.password) {
      setError("New password cannot be the same as the temporary password.");
      return;
    }
    setLoading(true);

    try {
      const updatedEmployees = data.employees.map(emp => 
        emp.id === tempUser?.id ? { ...emp, password: newPassword, isTempPassword: false } : emp
      );
      
      const updatedEmp = updatedEmployees.find(emp => emp.id === tempUser?.id);
      if (updatedEmp) {
        const log = createAuditLog("EDIT", updatedEmp.id, `Password force changed for user: ${updatedEmp.name}`, updatedEmp.id);
        await updateData({
          ...data,
          employees: updatedEmployees,
          auditLogs: [log, ...data.auditLogs]
        }, true);
        login(updatedEmp);
      } else {
        setError("Failed to update password.");
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred while updating the password.");
      setLoading(false);
    }
  };

  const handleForgotPasswordRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    if (!email) {
      setError("Please enter your email address.");
      return;
    }
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() })
      });
      const resData = await res.json();
      if (res.ok && resData.success) {
        setSuccessMsg("OTP sent to your email successfully.");
        setView('otp');
      } else {
        setError(resData.error || "Failed to send OTP.");
      }
    } catch (err: any) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    if (!otp) {
      setError("Please enter the OTP.");
      return;
    }
    if (!newPassword) {
      setError("Please enter a new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: email.trim(), 
          otp: otp.trim(), 
          newPassword 
        })
      });
      const resData = await res.json();
      if (res.ok && resData.success) {
        // Fetch fresh data from database
        const freshRes = await fetch(`${API_BASE_URL}/api/db`);
        const freshData = await freshRes.json();
        
        const resetEmp = freshData.employees?.find((emp: any) => emp.email.toLowerCase() === email.trim().toLowerCase());
        const actorId = resetEmp ? resetEmp.id : "system";
        const log = createAuditLog("EDIT", actorId, `Password reset via OTP for user: ${email.trim()}`, actorId);

        await updateData({
          ...freshData,
          auditLogs: [log, ...(freshData.auditLogs || [])]
        }, true);
        
        setSuccessMsg("Password reset successfully! Log in below.");
        setView('login');
        setPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setOtp("");
      } else {
        setError(resData.error || "Failed to reset password.");
      }
    } catch (err: any) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#e2e8f0] flex flex-col justify-center items-center p-6 relative overflow-hidden font-sans">
      <div className="w-full max-w-sm z-10">
        <div className="relative bg-white rounded-2xl p-8 md:p-10 shadow-xl border border-slate-100 mt-12">
          {/* Circular Badge Overlap */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-[#3182ce] border-[6px] border-[#e2e8f0] flex items-center justify-center shadow-lg animate-in zoom-in duration-300">
            {view === 'force_change' ? (
              <Lock className="w-10 h-10 text-white" />
            ) : view === 'forgot' || view === 'otp' ? (
              <Mail className="w-10 h-10 text-white" />
            ) : (
              <User className="w-10 h-10 text-white" />
            )}
          </div>

          <div className="pt-8">
            {view === 'login' && (
              <>
                <h2 className="text-lg font-bold text-slate-700 text-center mb-6">User Log in</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-[11px] font-bold text-rose-600 flex items-center gap-2 animate-shake">
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                  {successMsg && (
                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-[11px] font-bold text-emerald-600 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>{successMsg}</span>
                    </div>
                  )}

                  <div className="relative">
                    <input
                      type="email"
                      required
                      placeholder="Email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full pl-6 pr-12 py-3.5 bg-[#f1f3f5] rounded-lg text-sm font-semibold outline-none text-slate-800 placeholder-slate-400 focus:bg-slate-100 transition-all border-none font-sans"
                    />
                    <User className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2" />
                  </div>

                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="Password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full pl-6 pr-12 py-3.5 bg-[#f1f3f5] rounded-lg text-sm font-semibold outline-none text-slate-800 placeholder-slate-400 focus:bg-slate-100 transition-all border-none font-sans"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 focus:outline-none text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-md"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-blue-400 text-white rounded-lg text-sm font-bold uppercase tracking-wider shadow-sm transition-all duration-200 active:translate-y-px flex items-center justify-center font-sans"
                    >
                      {loading ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        "LOGIN"
                      )}
                    </button>
                  </div>
                </form>

                <div className="text-center mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setView('forgot');
                      setError("");
                      setSuccessMsg("");
                    }}
                    className="text-xs text-slate-500 font-semibold hover:underline bg-transparent border-none cursor-pointer focus:outline-none"
                  >
                    Forgot <span className="text-[#3182ce]">Password?</span>
                  </button>
                </div>
              </>
            )}

            {view === 'force_change' && (
              <>
                <h2 className="text-lg font-bold text-slate-700 text-center mb-6">Change Password</h2>
                <p className="text-xs text-slate-500 text-center mb-6">
                  You are logging in with a temporary password. Please set a new password.
                </p>
                <form onSubmit={handleForceChangeSubmit} className="space-y-4">
                  {error && (
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-[11px] font-bold text-rose-600 flex items-center gap-2 animate-shake">
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      required
                      placeholder="New Password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full pl-6 pr-12 py-3.5 bg-[#f1f3f5] rounded-lg text-sm font-semibold outline-none text-slate-800 placeholder-slate-400 focus:bg-slate-100 transition-all border-none font-sans"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 focus:outline-none text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-md"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      placeholder="Confirm New Password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full pl-6 pr-12 py-3.5 bg-[#f1f3f5] rounded-lg text-sm font-semibold outline-none text-slate-800 placeholder-slate-400 focus:bg-slate-100 transition-all border-none font-sans"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 focus:outline-none text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-md"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-blue-400 text-white rounded-lg text-sm font-bold uppercase tracking-wider shadow-sm transition-all duration-200 active:translate-y-px flex items-center justify-center font-sans"
                    >
                      {loading ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        "RESET PASSWORD"
                      )}
                    </button>
                  </div>
                </form>
              </>
            )}

            {view === 'forgot' && (
              <>
                <h2 className="text-lg font-bold text-slate-700 text-center mb-6">Forgot Password</h2>
                <p className="text-xs text-slate-500 text-center mb-6 font-sans">
                  Enter your email address and we'll send you a 6-digit OTP to reset your password.
                </p>
                <form onSubmit={handleForgotPasswordRequest} className="space-y-4">
                  {error && (
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-[11px] font-bold text-rose-600 flex items-center gap-2 animate-shake">
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="relative">
                    <input
                      type="email"
                      required
                      placeholder="Email Address"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full pl-6 pr-12 py-3.5 bg-[#f1f3f5] rounded-lg text-sm font-semibold outline-none text-slate-800 placeholder-slate-400 focus:bg-slate-100 transition-all border-none font-sans"
                    />
                    <Mail className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2" />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-blue-400 text-white rounded-lg text-sm font-bold uppercase tracking-wider shadow-sm transition-all duration-200 active:translate-y-px flex items-center justify-center font-sans"
                    >
                      {loading ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        "SEND OTP"
                      )}
                    </button>
                  </div>
                </form>

                <div className="text-center mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setView('login');
                      setError("");
                      setSuccessMsg("");
                    }}
                    className="text-xs text-slate-500 font-semibold hover:underline bg-transparent border-none cursor-pointer focus:outline-none"
                  >
                    Back to <span className="text-[#3182ce]">Login</span>
                  </button>
                </div>
              </>
            )}

            {view === 'otp' && (
              <>
                <h2 className="text-lg font-bold text-slate-700 text-center mb-6">Enter OTP</h2>
                {successMsg && (
                  <p className="text-xs text-emerald-600 text-center mb-6 font-semibold bg-emerald-50 p-2.5 rounded-lg border border-emerald-100 font-sans">
                    {successMsg}
                  </p>
                )}
                <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                  {error && (
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-[11px] font-bold text-rose-600 flex items-center gap-2 animate-shake">
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="relative">
                    <input
                      type="text"
                      required
                      placeholder="6-digit OTP"
                      maxLength={6}
                      value={otp}
                      onChange={e => setOtp(e.target.value)}
                      className="w-full pl-6 pr-12 py-3.5 bg-[#f1f3f5] rounded-lg text-sm font-semibold outline-none text-slate-800 placeholder-slate-400 focus:bg-slate-100 transition-all border-none font-sans text-center tracking-[4px]"
                    />
                    <Key className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2" />
                  </div>

                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      required
                      placeholder="New Password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full pl-6 pr-12 py-3.5 bg-[#f1f3f5] rounded-lg text-sm font-semibold outline-none text-slate-800 placeholder-slate-400 focus:bg-slate-100 transition-all border-none font-sans"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 focus:outline-none text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-md"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      placeholder="Confirm New Password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full pl-6 pr-12 py-3.5 bg-[#f1f3f5] rounded-lg text-sm font-semibold outline-none text-slate-800 placeholder-slate-400 focus:bg-slate-100 transition-all border-none font-sans"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 focus:outline-none text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-md"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-blue-400 text-white rounded-lg text-sm font-bold uppercase tracking-wider shadow-sm transition-all duration-200 active:translate-y-px flex items-center justify-center font-sans"
                    >
                      {loading ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        "RESET PASSWORD"
                      )}
                    </button>
                  </div>
                </form>

                <div className="text-center mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setView('login');
                      setError("");
                      setSuccessMsg("");
                      setOtp("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    className="text-xs text-slate-500 font-semibold hover:underline bg-transparent border-none cursor-pointer focus:outline-none"
                  >
                    Cancel and return to <span className="text-[#3182ce]">Login</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Providers ---

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<Employee | null>(() => {
    const saved = sessionStorage.getItem("current_user");
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const { data } = useData();

  const switchRole = (role: UserRole) => {
    const nextUser = data.employees.find(e => e.role === role);
    if (nextUser) {
      setUser(nextUser);
      sessionStorage.setItem("current_user", JSON.stringify(nextUser));
    }
  };

  const login = (emp: Employee) => {
    setUser(emp);
    sessionStorage.setItem("current_user", JSON.stringify(emp));
  };

  const logout = () => {
    setUser(null);
    sessionStorage.removeItem("current_user");
  };

  return (
    <AuthContext.Provider value={{ user, setUser, switchRole, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

const sortAppraisalCycles = (cycles: AppraisalCycle[]): AppraisalCycle[] => {
  return [...cycles].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "Monthly" ? -1 : 1;
    }
    return a.startDate.localeCompare(b.startDate);
  });
};

const generateDefaultAppraisalCycles = (): AppraisalCycle[] => {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // 1-indexed

  const cycles: AppraisalCycle[] = [];

  // Generate 12 Monthly Cycles
  for (let m = 1; m <= 12; m++) {
    const monthDate = new Date(currentYear, m - 1, 1);
    const monthName = monthDate.toLocaleString('en-US', { month: 'long' });
    const startDate = `${currentYear}-${String(m).padStart(2, '0')}-01`;
    // Last day of month
    const lastDay = new Date(currentYear, m, 0).getDate();
    const endDate = `${currentYear}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    let status: AppraisalCycle["status"] = "Drafted";
    if (m === currentMonth) {
      status = "Active";
    } else if (m < currentMonth) {
      status = "Completed";
    }

    const cycleYear = m < 7 ? currentYear : currentYear + 1;

    cycles.push({
      id: `cycle-monthly-${cycleYear}-${m}`,
      name: `${monthName} ${cycleYear} Cycle`,
      type: "Monthly",
      status,
      startDate,
      endDate,
      year: cycleYear,
      month: m
    });
  }

  // Add Yearly Cycle
  const fiscalYearStartYear = currentMonth < 7 ? currentYear - 1 : currentYear;
  const yearlyCycleYear = fiscalYearStartYear + 1;
  cycles.push({
    id: `cycle-yearly-${yearlyCycleYear}`,
    name: `FY ${fiscalYearStartYear}-${String(fiscalYearStartYear + 1).slice(2)} Strategic Year`,
    type: "Yearly",
    status: "Active",
    startDate: `${fiscalYearStartYear}-07-01`,
    endDate: `${fiscalYearStartYear + 1}-06-30`,
    year: yearlyCycleYear
  });

  return cycles;
};

const DataProvider = ({ children }: { children: React.ReactNode }) => {
  const [data, setData] = useState<AppData>({
    employees: [],
    goals: [],
    submissions: [],
    achievements: [],
    appraisals: [],
    appraisalCycles: sortAppraisalCycles(generateDefaultAppraisalCycles()),
    complaints: [],
    notifications: [],
    monthlyScores: [],
    manualAdjustments: [],
    auditLogs: [],
    permissions: [],
    badges: [],
    recognitions: [],
    pointConfig: {
      weeklySubmission: 5,
      achievement: 10,
      certification: 15
    }
  });
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [savingMessage, setSavingMessage] = useState("");
  const [toasts, setToasts] = useState<{id: string, message: string, type: 'success' | 'error'}[]>([]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  const createAuditLog = (action: AuditLog["action"], targetId: string, details: string, actorId?: string): AuditLog => ({
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    action,
    actorId: actorId || "system",
    targetId,
    details,
    timestamp: new Date().toISOString()
  });

  const loadDataFromServer = async (isReload = false) => {
    if (!isReload) {
      setLoading(true);
    }
    try {
      const d = await API.fetchData();
      if (!d || d.error || !d.employees) {
        console.error("Failed to load database. Fetch response:", d);
        showToast("Failed to connect to database.", "error");
        if (!isReload) setLoading(false);
        return;
      }
      let cycles = sortAppraisalCycles(d.appraisalCycles || []);
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;
      const fiscalYearStartYear = currentMonth < 7 ? currentYear - 1 : currentYear;
      const targetYearForMonth = currentMonth < 7 ? currentYear : currentYear + 1;
      let hasChanges = false;

      // 1. Validate Monthly Cycles
      const activeMonthly = cycles.find(c => c.type === "Monthly" && c.status === "Active");
      if (!activeMonthly || activeMonthly.month !== currentMonth || activeMonthly.year !== targetYearForMonth) {
        cycles = cycles.map(c => {
          if (c.type === "Monthly") {
            let targetStatus: AppraisalCycle["status"] = c.status;
            const cycleCalendarYear = c.month >= 7 ? c.year - 1 : c.year;
            if (cycleCalendarYear < currentYear || (cycleCalendarYear === currentYear && c.month < currentMonth)) {
              targetStatus = "Completed";
            } else if (cycleCalendarYear === currentYear && c.month === currentMonth) {
              targetStatus = "Active";
            } else {
              targetStatus = "Drafted";
            }
            if (targetStatus !== c.status) {
              hasChanges = true;
              return { ...c, status: targetStatus };
            }
          }
          return c;
        });

        const currentMonthExists = cycles.some(c => c.type === "Monthly" && c.year === targetYearForMonth && c.month === currentMonth);
        if (!currentMonthExists) {
          const monthDate = new Date(currentYear, currentMonth - 1, 1);
          const monthName = monthDate.toLocaleString('en-US', { month: 'long' });
          const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
          const lastDay = new Date(currentYear, currentMonth, 0).getDate();
          const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
          cycles.push({
            id: `cycle-monthly-${targetYearForMonth}-${currentMonth}`,
            name: `${monthName} ${targetYearForMonth} Cycle`,
            type: "Monthly",
            status: "Active",
            startDate,
            endDate,
            year: targetYearForMonth,
            month: currentMonth
          });
          hasChanges = true;
        }
      }

      // 2. Validate Yearly Cycles
      const targetYearlyCycleYear = fiscalYearStartYear + 1;
      cycles = cycles.map(c => {
        if (c.type === "Yearly") {
          let targetStatus: AppraisalCycle["status"] = c.status;
          if (c.year < targetYearlyCycleYear) {
            targetStatus = "Completed";
          } else if (c.year === targetYearlyCycleYear) {
            targetStatus = "Active";
          } else {
            targetStatus = "Drafted";
          }
          if (targetStatus !== c.status) {
            hasChanges = true;
            return { ...c, status: targetStatus };
          }
        }
        return c;
      });

      const currentYearlyExists = cycles.some(c => c.type === "Yearly" && c.year === targetYearlyCycleYear);
      if (!currentYearlyExists) {
        cycles.push({
          id: `cycle-yearly-${targetYearlyCycleYear}`,
          name: `FY ${fiscalYearStartYear}-${String(fiscalYearStartYear + 1).slice(2)} Strategic Year`,
          type: "Yearly",
          status: "Active",
          startDate: `${fiscalYearStartYear}-07-01`,
          endDate: `${fiscalYearStartYear + 1}-06-30`,
          year: targetYearlyCycleYear
        });
        hasChanges = true;
      }

      const updatedData: AppData = {
        employees: d.employees || [],
        goals: d.goals || [],
        submissions: d.submissions || [],
        achievements: d.achievements || [],
        appraisals: d.appraisals || [],
        appraisalCycles: sortAppraisalCycles(cycles),
        complaints: d.complaints || [],
        notifications: d.notifications || [],
        monthlyScores: d.monthlyScores || [],
        manualAdjustments: d.manualAdjustments || [],
        auditLogs: d.auditLogs || [],
        permissions: d.permissions || [],
        badges: d.badges || [],
        recognitions: d.recognitions || [],
        pointConfig: d.pointConfig || {
          weeklySubmission: 5,
          achievement: 10,
          certification: 15
        }
      };

      setData(updatedData);
      if (hasChanges) {
        await API.saveData(updatedData);
      }
    } catch (err) {
      console.error("Error loading data from server:", err);
    } finally {
      if (!isReload) setLoading(false);
    }
  };

  useEffect(() => {
    loadDataFromServer();
  }, []);

  const reloadData = async () => {
    await loadDataFromServer(true);
  };

  const updateData = async (newData: AppData, skipLoadingOverlay?: boolean) => {
    const isSettings = typeof window !== "undefined" && window.location.pathname === "/settings";
    let finalEmployees = newData.employees;
    let finalGoals = newData.goals;
    let finalSubmissions = newData.submissions;
    let finalAchievements = newData.achievements;
    let finalComplaints = newData.complaints;
    let finalAppraisals = newData.appraisals;
    let finalMonthlyScores = newData.monthlyScores;
    let finalManualAdjustments = newData.manualAdjustments;
    let finalNotifications = newData.notifications;
    let finalRecognitions = newData.recognitions;

    if (!isSettings && data.employees) {
      const inactiveEmps = data.employees.filter(e => !e.isActive);
      const inactiveEmpIds = new Set(inactiveEmps.map(e => e.id));

      const newEmpIds = new Set(newData.employees.map(e => e.id));
      const restoredEmps = [...newData.employees];
      for (const e of inactiveEmps) {
        if (!newEmpIds.has(e.id)) restoredEmps.push(e);
      }
      finalEmployees = restoredEmps;

      if (data.goals) {
        const inactiveGoals = data.goals.filter(g => inactiveEmpIds.has(g.employeeId));
        const newGoalIds = new Set(newData.goals.map(g => g.id));
        const restoredGoals = [...newData.goals];
        for (const g of inactiveGoals) {
          if (!newGoalIds.has(g.id)) restoredGoals.push(g);
        }
        finalGoals = restoredGoals;
      }

      if (data.submissions) {
        const inactiveSubmissions = data.submissions.filter(s => inactiveEmpIds.has(s.employeeId));
        const newSubIds = new Set(newData.submissions.map(s => s.id));
        const restoredSubmissions = [...newData.submissions];
        for (const s of inactiveSubmissions) {
          if (!newSubIds.has(s.id)) restoredSubmissions.push(s);
        }
        finalSubmissions = restoredSubmissions;
      }

      if (data.achievements) {
        const inactiveAchievements = data.achievements.filter(a => inactiveEmpIds.has(a.employeeId));
        const newAchIds = new Set(newData.achievements.map(a => a.id));
        const restoredAchievements = [...newData.achievements];
        for (const a of inactiveAchievements) {
          if (!newAchIds.has(a.id)) restoredAchievements.push(a);
        }
        finalAchievements = restoredAchievements;
      }

      if (data.complaints) {
        const inactiveComplaints = data.complaints.filter(c => inactiveEmpIds.has(c.employeeId));
        const newCompIds = new Set(newData.complaints.map(c => c.id));
        const restoredComplaints = [...newData.complaints];
        for (const c of inactiveComplaints) {
          if (!newCompIds.has(c.id)) restoredComplaints.push(c);
        }
        finalComplaints = restoredComplaints;
      }

      if (data.appraisals) {
        const inactiveAppraisals = data.appraisals.filter(ap => inactiveEmpIds.has(ap.employeeId));
        const newAprIds = new Set(newData.appraisals.map(ap => ap.id));
        const restoredAppraisals = [...newData.appraisals];
        for (const ap of inactiveAppraisals) {
          if (!newAprIds.has(ap.id)) restoredAppraisals.push(ap);
        }
        finalAppraisals = restoredAppraisals;
      }

      if (data.monthlyScores) {
        const inactiveMonthlyScores = data.monthlyScores.filter(ms => inactiveEmpIds.has(ms.employeeId));
        const newScoreIds = new Set(newData.monthlyScores.map(ms => ms.id));
        const restoredMonthlyScores = [...newData.monthlyScores];
        for (const ms of inactiveMonthlyScores) {
          if (!newScoreIds.has(ms.id)) restoredMonthlyScores.push(ms);
        }
        finalMonthlyScores = restoredMonthlyScores;
      }

      if (data.manualAdjustments) {
        const inactiveManualAdjustments = data.manualAdjustments.filter(ma => inactiveEmpIds.has(ma.employeeId));
        const newAdjIds = new Set(newData.manualAdjustments.map(ma => ma.id));
        const restoredManualAdjustments = [...newData.manualAdjustments];
        for (const ma of inactiveManualAdjustments) {
          if (!newAdjIds.has(ma.id)) restoredManualAdjustments.push(ma);
        }
        finalManualAdjustments = restoredManualAdjustments;
      }

      if (data.notifications) {
        const inactiveNotifications = data.notifications.filter(n => inactiveEmpIds.has(n.userId));
        const newNotIds = new Set(newData.notifications.map(n => n.id));
        const restoredNotifications = [...newData.notifications];
        for (const n of inactiveNotifications) {
          if (!newNotIds.has(n.id)) restoredNotifications.push(n);
        }
        finalNotifications = restoredNotifications;
      }

      if (data.recognitions) {
        const inactiveRecognitions = data.recognitions.filter(r => inactiveEmpIds.has(r.employeeId));
        const newRecIds = new Set(newData.recognitions.map(r => r.id));
        const restoredRecognitions = [...newData.recognitions];
        for (const r of inactiveRecognitions) {
          if (!newRecIds.has(r.id)) restoredRecognitions.push(r);
        }
        finalRecognitions = restoredRecognitions;
      }
    }

    const mergedData = {
      ...newData,
      employees: finalEmployees,
      goals: finalGoals,
      submissions: finalSubmissions,
      achievements: finalAchievements,
      complaints: finalComplaints,
      appraisals: finalAppraisals,
      monthlyScores: finalMonthlyScores,
      manualAdjustments: finalManualAdjustments,
      notifications: finalNotifications,
      recognitions: finalRecognitions
    };

    let loadingMsg = "Saving changes...";
    let successMsg = "Changes saved successfully";

    try {
      // 1. Detect Goal changes
      if (mergedData.goals.length > data.goals.length) {
        loadingMsg = "Assigning goal...";
        successMsg = "Goal assigned successfully";
      } else if (mergedData.goals.length < data.goals.length) {
        loadingMsg = "Removing goal...";
        successMsg = "Goal removed successfully";
      } else {
        // Look for modified goal
        for (const newGoal of mergedData.goals) {
          const oldGoal = data.goals.find(g => g.id === newGoal.id);
          if (oldGoal && JSON.stringify(oldGoal) !== JSON.stringify(newGoal)) {
            if (newGoal.status !== oldGoal.status) {
              if (newGoal.status === "Approved") {
                loadingMsg = "Approving goal...";
                successMsg = "Goal approved successfully";
              } else if (newGoal.status === "Completed") {
                loadingMsg = "Submitting goal...";
                successMsg = "Goal submitted successfully";
              }
            } else if (newGoal.progress !== oldGoal.progress) {
              loadingMsg = "Updating goal progress...";
              successMsg = "Goal progress updated successfully";
            }
            break;
          }
        }
      }

      // 2. Detect Weekly submissions changes
      if (mergedData.submissions.length > data.submissions.length) {
        loadingMsg = "Submitting weekly review...";
        successMsg = "Weekly review submitted successfully";
      } else if (mergedData.submissions.length < data.submissions.length) {
        loadingMsg = "Removing submission...";
        successMsg = "Submission removed successfully";
      } else {
        // Look for modified submission
        for (const newSub of mergedData.submissions) {
          const oldSub = data.submissions.find(s => s.id === newSub.id);
          if (oldSub && JSON.stringify(oldSub) !== JSON.stringify(newSub)) {
            if (newSub.status !== oldSub.status) {
              if (newSub.status === "Approved") {
                loadingMsg = "Approving weekly submission...";
                successMsg = "Weekly submission approved successfully";
              } else if (newSub.status === "Rejected") {
                loadingMsg = "Rejecting weekly submission...";
                successMsg = "Weekly submission rejected successfully";
              }
            }
            break;
          }
        }
      }

      // 3. Detect Achievement changes
      if (mergedData.achievements.length > data.achievements.length) {
        loadingMsg = "Submitting achievement...";
        successMsg = "Achievement submitted successfully";
      } else if (mergedData.achievements.length < data.achievements.length) {
        loadingMsg = "Removing achievement...";
        successMsg = "Achievement removed successfully";
      } else {
        for (const newAch of mergedData.achievements) {
          const oldAch = data.achievements.find(a => a.id === newAch.id);
          if (oldAch && JSON.stringify(oldAch) !== JSON.stringify(newAch)) {
            if (newAch.status !== oldAch.status) {
              if (newAch.status === "Approved") {
                loadingMsg = "Approving achievement...";
                successMsg = "Achievement approved successfully";
              } else if (newAch.status === "Rejected") {
                loadingMsg = "Rejecting achievement...";
                successMsg = "Achievement rejected successfully";
              }
            }
            break;
          }
        }
      }

      // 4. Detect Complaint/Infraction changes
      if (mergedData.complaints.length > data.complaints.length) {
        loadingMsg = "Registering complaint...";
        successMsg = "Complaint registered successfully";
      } else if (mergedData.complaints.length < data.complaints.length) {
        loadingMsg = "Removing complaint...";
        successMsg = "Complaint removed successfully";
      } else {
        for (const newCmp of mergedData.complaints) {
          const oldCmp = data.complaints.find(c => c.id === newCmp.id);
          if (oldCmp && JSON.stringify(oldCmp) !== JSON.stringify(newCmp)) {
            if (newCmp.status !== oldCmp.status) {
              if (newCmp.status === "Validated") {
                loadingMsg = "Validating complaint...";
                successMsg = "Complaint validated successfully";
              } else if (newCmp.status === "Dismissed") {
                loadingMsg = "Dismissing complaint...";
                successMsg = "Complaint dismissed successfully";
              }
            }
            break;
          }
        }
      }

      // 5. Detect Point Config changes
      if (JSON.stringify(data.pointConfig) !== JSON.stringify(mergedData.pointConfig)) {
        loadingMsg = "Saving point configuration...";
        successMsg = "Point configuration saved successfully";
      }

      // 6. Detect Appraisal Cycles changes
      if (data.appraisalCycles && mergedData.appraisalCycles) {
        if (mergedData.appraisalCycles.length > data.appraisalCycles.length) {
          loadingMsg = "Creating appraisal cycle...";
          successMsg = "Appraisal cycle created successfully";
        } else {
          for (const newCyc of mergedData.appraisalCycles) {
            const oldCyc = data.appraisalCycles.find(c => c.id === newCyc.id);
            if (oldCyc && JSON.stringify(oldCyc) !== JSON.stringify(newCyc)) {
              loadingMsg = `Updating appraisal cycle: ${newCyc.name}...`;
              successMsg = `Appraisal cycle updated successfully`;
              break;
            }
          }
        }
      }

      // 7. Detect Manual Adjustments changes
      if (mergedData.manualAdjustments && data.manualAdjustments) {
        if (mergedData.manualAdjustments.length > data.manualAdjustments.length) {
          loadingMsg = "Applying manual credit/demerit...";
          successMsg = "Manual adjustment applied successfully";
        }
      }

      // 8. Detect Employee changes (e.g., active status, updating credentials, adding user)
      if (mergedData.employees.length > data.employees.length) {
        loadingMsg = "Registering new employee...";
        successMsg = "Employee registered successfully";
      } else if (mergedData.employees.length < data.employees.length) {
        loadingMsg = "Removing employee...";
        successMsg = "Employee removed successfully";
      } else {
        for (const newEmp of mergedData.employees) {
          const oldEmp = data.employees.find(e => e.id === newEmp.id);
          if (oldEmp && JSON.stringify(oldEmp) !== JSON.stringify(newEmp)) {
            if (newEmp.isActive !== oldEmp.isActive) {
              loadingMsg = newEmp.isActive ? "Activating employee profile..." : "Deactivating employee profile...";
              successMsg = newEmp.isActive ? "Employee profile activated" : "Employee profile deactivated";
            } else if (newEmp.role !== oldEmp.role || newEmp.managerId !== oldEmp.managerId || newEmp.department !== oldEmp.department) {
              loadingMsg = "Updating employee credentials...";
              successMsg = "Employee credentials updated successfully";
            }
            break;
          }
        }
      }

      // 9. Detect Appraisal changes (reviews)
      if (mergedData.appraisals && data.appraisals) {
        if (mergedData.appraisals.length > data.appraisals.length) {
          loadingMsg = "Submitting performance appraisal...";
          successMsg = "Performance appraisal submitted successfully";
        } else {
          for (const newApr of mergedData.appraisals) {
            const oldApr = data.appraisals.find(a => a.id === newApr.id);
            if (oldApr && JSON.stringify(oldApr) !== JSON.stringify(newApr)) {
              loadingMsg = "Submitting performance appraisal...";
              successMsg = "Performance appraisal submitted successfully";
              break;
            }
          }
        }
      }

    } catch (err) {
      console.error("Diff detection error:", err);
    }

    if (!skipLoadingOverlay) {
      setIsSaving(true);
      setSavingMessage(loadingMsg);
    }
    
    const startTime = Date.now();
    try {
      const sortedNewData = {
        ...mergedData,
        appraisalCycles: sortAppraisalCycles(mergedData.appraisalCycles || [])
      };
      setData(sortedNewData);
      await API.saveData(sortedNewData);
      
      const elapsed = Date.now() - startTime;
      const minDelay = 800; // ms for nice transition animation feel
      if (!skipLoadingOverlay && elapsed < minDelay) {
        await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
      }
      
      if (!skipLoadingOverlay) {
        showToast(successMsg, "success");
      }
    } catch (error) {
      console.error("Failed to save data:", error);
      showToast("Operation failed to save", "error");
    } finally {
      if (!skipLoadingOverlay) {
        setIsSaving(false);
        setSavingMessage("");
      }
    }
  };

  return (
    <DataContext.Provider value={{ data, updateData, createAuditLog, loading, showToast, reloadData }}>
      {children}
      {/* Toast Notification Hub */}
      <div className="fixed bottom-8 right-8 z-[100] flex flex-col gap-3">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div 
              key={toast.id}
              initial={{ opacity: 0, x: 20, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              className={cn(
                "px-6 py-4 rounded-2xl shadow-2xl border flex items-center gap-4 min-w-[300px]",
                toast.type === 'success' ? "bg-emerald-600 border-emerald-500 text-white" : "bg-rose-600 border-rose-500 text-white"
              )}
            >
              {toast.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-200" /> : <AlertCircle className="w-5 h-5 text-rose-200" />}
              <p className="text-xs font-black uppercase tracking-widest">{toast.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Global Loading Backdrop Overlay */}
      {isSaving && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/40 backdrop-blur-[3px] flex items-center justify-center pointer-events-auto">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/90 backdrop-blur-md rounded-[2.5rem] p-10 shadow-2xl border border-slate-100 flex flex-col items-center max-w-sm w-full mx-4"
          >
            <div className="relative flex items-center justify-center w-20 h-20 mb-6">
              {/* Outer glowing pulsing ring */}
              <div className="absolute inset-0 rounded-full bg-indigo-500/10 animate-ping"></div>
              {/* Spinning loading indicator */}
              <div className="w-14 h-14 border-4 border-slate-100 rounded-full"></div>
              <div className="absolute w-14 h-14 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <Target className="absolute w-6 h-6 text-indigo-600 animate-pulse" />
            </div>
            <h3 className="text-slate-900 text-sm font-black uppercase tracking-[0.25em] text-center mb-2">
              Action in Progress
            </h3>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest text-center animate-pulse">
              {savingMessage || "Processing request..."}
            </p>
          </motion.div>
        </div>
      )}
    </DataContext.Provider>
  );
};

// --- App Root ---

function AppContent() {
  const { user } = useAuth();
  const { data, loading } = useData();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const isHR = user?.role === "HR";
  const isManagement = user?.role === "MANAGEMENT";
  const perm = data.permissions?.find(p => p.role === user?.role);
  const showSettings = perm?.modules?.settings ?? (isHR || isManagement);
  const showHRRoutes = isHR || isManagement;

  return (
    <BrowserRouter>
      <Routes>
        {!user ? (
          <>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate to="/login" />} />
          </>
        ) : (
          <>
            {/* Common Routes */}
            <Route path="/" element={<MainLayout><Dashboard /></MainLayout>} />
            <Route path="/goals" element={<MainLayout><GoalsView /></MainLayout>} />
            <Route path="/submissions" element={<MainLayout><WeeklyReview /></MainLayout>} />
            <Route path="/achievements" element={<MainLayout><AchievementsView /></MainLayout>} />
            {user?.role !== "EMPLOYEE" ? (
              <Route path="/appraisal" element={<MainLayout><AppraisalManagementView /></MainLayout>} />
            ) : (
              <Route path="/appraisal" element={<Navigate to="/" />} />
            )}
            <Route path="/recognition" element={<MainLayout><RecognitionView /></MainLayout>} />

            {/* HR / Admin Gated Routes */}
            {showHRRoutes ? (
              <>
                <Route path="/team-goals" element={<MainLayout><TeamGoalsView /></MainLayout>} />
                <Route path="/review" element={<MainLayout><PerformanceReviewView /></MainLayout>} />
                <Route path="/complaints" element={<MainLayout><ComplaintsView /></MainLayout>} />
              </>
            ) : (
              <>
                <Route path="/team-goals" element={<Navigate to="/" />} />
                <Route path="/review" element={<Navigate to="/" />} />
                <Route path="/complaints" element={<Navigate to="/" />} />
              </>
            )}

            {/* Settings Gated Route */}
            {showSettings ? (
              <Route path="/settings" element={<MainLayout><SettingsView /></MainLayout>} />
            ) : (
              <Route path="/settings" element={<Navigate to="/" />} />
            )}

            <Route path="*" element={<Navigate to="/" />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <DataProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </DataProvider>
  );
}
