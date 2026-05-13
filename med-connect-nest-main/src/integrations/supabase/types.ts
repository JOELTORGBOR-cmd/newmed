export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          patient_id: string | null
          record_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json | null
          patient_id?: string | null
          record_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          patient_id?: string | null
          record_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      allergies: {
        Row: {
          allergen: string
          created_at: string
          id: string
          patient_id: string
          severity: string | null
        }
        Insert: {
          allergen: string
          created_at?: string
          id?: string
          patient_id: string
          severity?: string | null
        }
        Update: {
          allergen?: string
          created_at?: string
          id?: string
          patient_id?: string
          severity?: string | null
        }
        Relationships: []
      }
      appointment_reminders: {
        Row: {
          appointment_id: string
          channel: string
          created_at: string
          created_on: string | null
          error: string | null
          id: string
          message: string | null
          patient_id: string
          sent_at: string | null
          sent_by: string | null
          status: string
        }
        Insert: {
          appointment_id: string
          channel?: string
          created_at?: string
          created_on?: string | null
          error?: string | null
          id?: string
          message?: string | null
          patient_id: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
        }
        Update: {
          appointment_id?: string
          channel?: string
          created_at?: string
          created_on?: string | null
          error?: string | null
          id?: string
          message?: string | null
          patient_id?: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          checked_in_at: string | null
          created_at: string
          doctor_email: string | null
          doctor_id: string | null
          id: string
          notes: string | null
          patient_id: string
          reason: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["appt_status"]
        }
        Insert: {
          checked_in_at?: string | null
          created_at?: string
          doctor_email?: string | null
          doctor_id?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          reason?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["appt_status"]
        }
        Update: {
          checked_in_at?: string | null
          created_at?: string
          doctor_email?: string | null
          doctor_id?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          reason?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["appt_status"]
        }
        Relationships: [
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctors: {
        Row: {
          avatar_url: string | null
          bio: string | null
          consultation_fee: number | null
          created_at: string
          full_name: string
          id: string
          profile_id: string | null
          rating: number | null
          specialty: string
          status: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          consultation_fee?: number | null
          created_at?: string
          full_name: string
          id?: string
          profile_id?: string | null
          rating?: number | null
          specialty: string
          status?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          consultation_fee?: number | null
          created_at?: string
          full_name?: string
          id?: string
          profile_id?: string | null
          rating?: number | null
          specialty?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctors_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drug_dispenses: {
        Row: {
          created_at: string
          dispensed_by: string | null
          drug_id: string | null
          id: string
          patient_id: string | null
          quantity: number
        }
        Insert: {
          created_at?: string
          dispensed_by?: string | null
          drug_id?: string | null
          id?: string
          patient_id?: string | null
          quantity?: number
        }
        Update: {
          created_at?: string
          dispensed_by?: string | null
          drug_id?: string | null
          id?: string
          patient_id?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "drug_dispenses_drug_id_fkey"
            columns: ["drug_id"]
            isOneToOne: false
            referencedRelation: "drugs"
            referencedColumns: ["id"]
          },
        ]
      }
      drugs: {
        Row: {
          category: string | null
          created_at: string
          expiry_date: string | null
          id: string
          low_stock_threshold: number
          name: string
          stock: number
          unit_price: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          low_stock_threshold?: number
          name: string
          stock?: number
          unit_price?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          low_stock_threshold?: number
          name?: string
          stock?: number
          unit_price?: number
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          appointment_id: string | null
          consultation_fee: number
          created_at: string
          description: string | null
          id: string
          lab_cost: number
          medicine_cost: number
          paid_at: string | null
          patient_id: string
          service_charge: number
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          consultation_fee?: number
          created_at?: string
          description?: string | null
          id?: string
          lab_cost?: number
          medicine_cost?: number
          paid_at?: string | null
          patient_id: string
          service_charge?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          consultation_fee?: number
          created_at?: string
          description?: string | null
          id?: string
          lab_cost?: number
          medicine_cost?: number
          paid_at?: string | null
          patient_id?: string
          service_charge?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
        }
        Relationships: []
      }
      lab_requests: {
        Row: {
          appointment_id: string | null
          completed_at: string | null
          created_at: string
          doctor_id: string | null
          id: string
          notes: string | null
          patient_id: string
          result_id: string | null
          status: string
          test_fee: number
          test_name: string
        }
        Insert: {
          appointment_id?: string | null
          completed_at?: string | null
          created_at?: string
          doctor_id?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          result_id?: string | null
          status?: string
          test_fee?: number
          test_name: string
        }
        Update: {
          appointment_id?: string | null
          completed_at?: string | null
          created_at?: string
          doctor_id?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          result_id?: string | null
          status?: string
          test_fee?: number
          test_name?: string
        }
        Relationships: []
      }
      lab_results: {
        Row: {
          created_at: string
          doctor_id: string | null
          file_path: string | null
          id: string
          patient_id: string
          result_summary: string | null
          status: string
          test_name: string
          viewed_at: string | null
        }
        Insert: {
          created_at?: string
          doctor_id?: string | null
          file_path?: string | null
          id?: string
          patient_id: string
          result_summary?: string | null
          status?: string
          test_name: string
          viewed_at?: string | null
        }
        Update: {
          created_at?: string
          doctor_id?: string | null
          file_path?: string | null
          id?: string
          patient_id?: string
          result_summary?: string | null
          status?: string
          test_name?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_results_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_records: {
        Row: {
          appointment_id: string | null
          created_at: string
          diagnosis: string | null
          doctor_id: string | null
          id: string
          notes: string | null
          patient_id: string
          treatment: string | null
          visit_date: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          diagnosis?: string | null
          doctor_id?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          treatment?: string | null
          visit_date?: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          diagnosis?: string | null
          doctor_id?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          treatment?: string | null
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_records_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          recipient_role: Database["public"]["Enums"]["app_role"]
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          recipient_role: Database["public"]["Enums"]["app_role"]
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          recipient_role?: Database["public"]["Enums"]["app_role"]
          title?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          network: string | null
          patient_id: string
          phone_masked: string | null
          provider: string
          reference: string
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          network?: string | null
          patient_id: string
          phone_masked?: string | null
          provider?: string
          reference: string
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          network?: string | null
          patient_id?: string
          phone_masked?: string | null
          provider?: string
          reference?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          created_at: string
          dispensed_at: string | null
          dispensed_by: string | null
          dosage: string | null
          drug_id: string | null
          drug_name: string
          duration: string | null
          id: string
          instructions: string | null
          patient_id: string
          quantity: number
          record_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          dispensed_at?: string | null
          dispensed_by?: string | null
          dosage?: string | null
          drug_id?: string | null
          drug_name: string
          duration?: string | null
          id?: string
          instructions?: string | null
          patient_id: string
          quantity?: number
          record_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          dispensed_at?: string | null
          dispensed_by?: string | null
          dosage?: string | null
          drug_id?: string | null
          drug_name?: string
          duration?: string | null
          id?: string
          instructions?: string | null
          patient_id?: string
          quantity?: number
          record_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "medical_records"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          dob: string | null
          full_name: string
          id: string
          phone: string | null
          status: string
          student_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          dob?: string | null
          full_name?: string
          id: string
          phone?: string | null
          status?: string
          student_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          dob?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          status?: string
          student_id?: string | null
        }
        Relationships: []
      }
      staff_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          user_a?: string
          user_b?: string
        }
        Relationships: []
      }
      staff_group_messages: {
        Row: {
          attachment_url: string | null
          body: string | null
          created_at: string
          id: string
          pinned: boolean
          reply_to: string | null
          sender_id: string
        }
        Insert: {
          attachment_url?: string | null
          body?: string | null
          created_at?: string
          id?: string
          pinned?: boolean
          reply_to?: string | null
          sender_id: string
        }
        Update: {
          attachment_url?: string | null
          body?: string | null
          created_at?: string
          id?: string
          pinned?: boolean
          reply_to?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_group_messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "staff_group_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_group_mutes: {
        Row: {
          created_at: string
          muted_by: string | null
          muted_until: string
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          muted_by?: string | null
          muted_until: string
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          muted_by?: string | null
          muted_until?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      staff_group_reactions: {
        Row: {
          created_at: string
          emoji: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_group_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "staff_group_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          status?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
        }
        Relationships: []
      }
      staff_messages: {
        Row: {
          attachment_url: string | null
          body: string | null
          conversation_id: string
          created_at: string
          deleted_for_sender: boolean
          id: string
          read_at: string | null
          sender_id: string
          status: string
        }
        Insert: {
          attachment_url?: string | null
          body?: string | null
          conversation_id: string
          created_at?: string
          deleted_for_sender?: boolean
          id?: string
          read_at?: string | null
          sender_id: string
          status?: string
        }
        Update: {
          attachment_url?: string | null
          body?: string | null
          conversation_id?: string
          created_at?: string
          deleted_for_sender?: boolean
          id?: string
          read_at?: string | null
          sender_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "staff_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_presence: {
        Row: {
          last_seen: string
          status: string
          typing_in_conversation: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          last_seen?: string
          status?: string
          typing_in_conversation?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          last_seen?: string
          status?: string
          typing_in_conversation?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vitals: {
        Row: {
          appointment_id: string | null
          bp: string | null
          heart_rate: number | null
          height: number | null
          id: string
          patient_id: string
          recorded_at: string
          temperature: number | null
          weight: number | null
        }
        Insert: {
          appointment_id?: string | null
          bp?: string | null
          heart_rate?: number | null
          height?: number | null
          id?: string
          patient_id: string
          recorded_at?: string
          temperature?: number | null
          weight?: number | null
        }
        Update: {
          appointment_id?: string | null
          bp?: string | null
          heart_rate?: number | null
          height?: number | null
          id?: string
          patient_id?: string
          recorded_at?: string
          temperature?: number | null
          weight?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_doctor_id: { Args: never; Returns: string }
      email_has_invitation: { Args: { _email: string }; Returns: boolean }
      find_patient_by_email: {
        Args: { _email: string }
        Returns: {
          email: string
          full_name: string
          id: string
        }[]
      }
      fn_recalc_invoice: { Args: { _invoice_id: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_accountant: { Args: { _user_id: string }; Returns: boolean }
      is_lab_tech: { Args: { _user_id: string }; Returns: boolean }
      is_nurse: { Args: { _user_id: string }; Returns: boolean }
      is_pharmacist: { Args: { _user_id: string }; Returns: boolean }
      is_receptionist: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "patient"
        | "doctor"
        | "staff"
        | "admin"
        | "nurse"
        | "lab_technician"
        | "pharmacist"
        | "receptionist"
        | "accountant"
      appt_status:
        | "pending"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "checked_in"
        | "waiting_for_nurse"
        | "awaiting_payment"
      invoice_status:
        | "pending"
        | "paid"
        | "overdue"
        | "cancelled"
        | "pending_verification"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "patient",
        "doctor",
        "staff",
        "admin",
        "nurse",
        "lab_technician",
        "pharmacist",
        "receptionist",
        "accountant",
      ],
      appt_status: [
        "pending",
        "confirmed",
        "completed",
        "cancelled",
        "checked_in",
        "waiting_for_nurse",
        "awaiting_payment",
      ],
      invoice_status: [
        "pending",
        "paid",
        "overdue",
        "cancelled",
        "pending_verification",
      ],
    },
  },
} as const
