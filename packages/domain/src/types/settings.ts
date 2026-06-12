export type SettingsRole = "gestor" | "operacional" | null;

export interface NotificationChannels {
  whatsapp: boolean;
  email: boolean;
  push: boolean;
}

export interface NotificationEvents {
  new_appointment: boolean;
  appointment_cancelled: boolean;
  appointment_reminder: boolean;
  new_message: boolean;
  payment_received: boolean;
  anamnese_submitted: boolean;
}

export interface NotificationQuietHours {
  enabled: boolean;
  start: string;
  end: string;
}

export interface NotificationSettings {
  schema_version: 1;
  channels: Partial<NotificationChannels>;
  events: Partial<NotificationEvents>;
  quiet_hours: Partial<NotificationQuietHours>;
}

export type NotificationSettingsValue = NotificationSettings | Record<string, never>;

export interface ProfessionalNotificationSettings {
  role: SettingsRole;
  clinicDefaults: NotificationSettingsValue;
  myPreferences: NotificationSettingsValue;
  myPreferencesSource: "clinic" | "individual";
}

export interface UpsertNotificationSettingsOutput {
  ok: true;
  notifications: NotificationSettings;
}

export interface UpsertMyNotificationPreferencesOutput {
  ok: true;
  preferences: NotificationSettings;
}

export type Weekday = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export interface TimeInterval {
  start: string;
  end: string;
}

export interface BusinessHoursException {
  date: string;
  closed?: boolean;
  intervals?: TimeInterval[];
}

export interface BusinessHours {
  schema_version: 1;
  timezone: string;
  weekly: Partial<Record<Weekday, TimeInterval[]>>;
  exceptions: BusinessHoursException[];
}

export type BusinessHoursValue = BusinessHours | Record<string, never>;

export interface ScheduleTeamMemberSummary {
  id: string;
  name: string;
  business_hours: BusinessHoursValue;
}

export interface ProfessionalScheduleSettings {
  role: SettingsRole;
  clinicHours: BusinessHoursValue;
  myHours: BusinessHoursValue;
  myHoursSource: "clinic" | "individual";
  teamMembers: ScheduleTeamMemberSummary[];
}

export interface UpsertBusinessHoursOutput {
  ok: true;
  business_hours: BusinessHours;
}

export interface UpsertTeamMemberBusinessHoursInput {
  teamMemberId: string;
  businessHours: BusinessHoursValue;
}

export interface UpsertTeamMemberBusinessHoursOutput {
  ok: true;
  team_member_id: string;
  business_hours: BusinessHoursValue;
}
