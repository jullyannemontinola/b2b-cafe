
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "app_users": {
                  Row: {
                    "company_id": string | null,"created_at": string,"id": string,"is_admin": boolean,"updated_at": string
                  }
                  Insert: {
                    "company_id"?: string | null,"created_at"?: string,"id": string,"is_admin"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string | null,"created_at"?: string,"id"?: string,"is_admin"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "app_users_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"companies": {
                  Row: {
                    "business_type": string,"contact_email": string,"contact_name": string,"contact_phone": string | null,"created_at": string,"description": string | null,"id": string,"is_demo": boolean,"logo_url": string | null,"name": string,"partnership_interests": string | null,"products_services": string | null,"tier": Database["public"]['Enums']["company_tier"],"updated_at": string,"website": string | null
                  }
                  Insert: {
                    "business_type": string,"contact_email": string,"contact_name": string,"contact_phone"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"is_demo"?: boolean,"logo_url"?: string | null,"name": string,"partnership_interests"?: string | null,"products_services"?: string | null,"tier": Database["public"]['Enums']["company_tier"],"updated_at"?: string,"website"?: string | null
                  }
                  Update: {
                    "business_type"?: string,"contact_email"?: string,"contact_name"?: string,"contact_phone"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"is_demo"?: boolean,"logo_url"?: string | null,"name"?: string,"partnership_interests"?: string | null,"products_services"?: string | null,"tier"?: Database["public"]['Enums']["company_tier"],"updated_at"?: string,"website"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"company_accounts": {
                  Row: {
                    "activated_at": string | null,"company_id": string,"created_at": string,"created_by": string | null,"invite_sent_at": string | null,"last_error": string | null,"login_email": string,"status": Database["public"]['Enums']["account_status"],"updated_at": string,"user_id": string | null
                  }
                  Insert: {
                    "activated_at"?: string | null,"company_id": string,"created_at"?: string,"created_by"?: string | null,"invite_sent_at"?: string | null,"last_error"?: string | null,"login_email": string,"status"?: Database["public"]['Enums']["account_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "activated_at"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"invite_sent_at"?: string | null,"last_error"?: string | null,"login_email"?: string,"status"?: Database["public"]['Enums']["account_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "company_accounts_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"event_config": {
                  Row: {
                    "day_end": string,"day_start": string,"event_dates": (string)[],"id": boolean,"slot_minutes": number,"timezone": string,"updated_at": string
                  }
                  Insert: {
                    "day_end": string,"day_start": string,"event_dates": (string)[],"id"?: boolean,"slot_minutes": number,"timezone": string,"updated_at"?: string
                  }
                  Update: {
                    "day_end"?: string,"day_start"?: string,"event_dates"?: (string)[],"id"?: boolean,"slot_minutes"?: number,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"meeting_participants": {
                  Row: {
                    "company_id": string,"meeting_id": string,"slot": unknown
                  }
                  Insert: {
                    "company_id": string,"meeting_id": string,"slot": unknown
                  }
                  Update: {
                    "company_id"?: string,"meeting_id"?: string,"slot"?: unknown
                  }
                  Relationships: [
                    {
      foreignKeyName: "meeting_participants_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meeting_participants_meeting_id_fkey"
      columns: ["meeting_id"]
isOneToOne: false
      referencedRelation: "meetings"
      referencedColumns: ["id"]
    }
                  ]
                },"meeting_tables": {
                  Row: {
                    "created_at": string,"event_date": string,"id": number,"is_active": boolean,"kind": Database["public"]['Enums']["table_kind"],"label": string,"location": string,"number": number,"owner_company_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"event_date": string,"id"?: never,"is_active"?: boolean,"kind"?: Database["public"]['Enums']["table_kind"],"label": string,"location": string,"number": number,"owner_company_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"event_date"?: string,"id"?: never,"is_active"?: boolean,"kind"?: Database["public"]['Enums']["table_kind"],"label"?: string,"location"?: string,"number"?: number,"owner_company_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meeting_tables_owner_company_id_fkey"
      columns: ["owner_company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"meeting_venue_changes": {
                  Row: {
                    "changed_at": string,"changed_by": string | null,"from_label": string,"from_table_id": number,"id": number,"meeting_id": string,"reason": string,"to_label": string,"to_table_id": number
                  }
                  Insert: {
                    "changed_at"?: string,"changed_by"?: string | null,"from_label": string,"from_table_id": number,"id"?: never,"meeting_id": string,"reason": string,"to_label": string,"to_table_id": number
                  }
                  Update: {
                    "changed_at"?: string,"changed_by"?: string | null,"from_label"?: string,"from_table_id"?: number,"id"?: never,"meeting_id"?: string,"reason"?: string,"to_label"?: string,"to_table_id"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "meeting_venue_changes_from_table_id_fkey"
      columns: ["from_table_id"]
isOneToOne: false
      referencedRelation: "meeting_tables"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meeting_venue_changes_meeting_id_fkey"
      columns: ["meeting_id"]
isOneToOne: false
      referencedRelation: "meetings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meeting_venue_changes_to_table_id_fkey"
      columns: ["to_table_id"]
isOneToOne: false
      referencedRelation: "meeting_tables"
      referencedColumns: ["id"]
    }
                  ]
                },"meetings": {
                  Row: {
                    "created_at": string,"ends_at": string,"id": string,"offer_id": string,"slot": unknown,"starts_at": string,"status": Database["public"]['Enums']["meeting_status"],"table_id": number,"thread_id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"ends_at": string,"id"?: string,"offer_id": string,"slot"?: never,"starts_at": string,"status"?: Database["public"]['Enums']["meeting_status"],"table_id": number,"thread_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"ends_at"?: string,"id"?: string,"offer_id"?: string,"slot"?: never,"starts_at"?: string,"status"?: Database["public"]['Enums']["meeting_status"],"table_id"?: number,"thread_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meetings_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: true
      referencedRelation: "offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meetings_table_id_fkey"
      columns: ["table_id"]
isOneToOne: false
      referencedRelation: "meeting_tables"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meetings_thread_id_fkey"
      columns: ["thread_id"]
isOneToOne: true
      referencedRelation: "threads"
      referencedColumns: ["id"]
    }
                  ]
                },"offers": {
                  Row: {
                    "created_at": string,"ends_at": string,"id": string,"message": string | null,"proposer_company_id": string,"starts_at": string,"thread_id": string,"version": number
                  }
                  Insert: {
                    "created_at"?: string,"ends_at": string,"id"?: string,"message"?: string | null,"proposer_company_id": string,"starts_at": string,"thread_id": string,"version": number
                  }
                  Update: {
                    "created_at"?: string,"ends_at"?: string,"id"?: string,"message"?: string | null,"proposer_company_id"?: string,"starts_at"?: string,"thread_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "offers_proposer_company_id_fkey"
      columns: ["proposer_company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_thread_id_fkey"
      columns: ["thread_id"]
isOneToOne: false
      referencedRelation: "threads"
      referencedColumns: ["id"]
    }
                  ]
                },"threads": {
                  Row: {
                    "a_last_read_at": string | null,"b_last_read_at": string | null,"company_a_id": string,"company_b_id": string,"created_at": string,"current_version": number,"id": string,"last_activity_at": string,"status": Database["public"]['Enums']["thread_status"],"updated_at": string
                  }
                  Insert: {
                    "a_last_read_at"?: string | null,"b_last_read_at"?: string | null,"company_a_id": string,"company_b_id": string,"created_at"?: string,"current_version"?: number,"id"?: string,"last_activity_at"?: string,"status"?: Database["public"]['Enums']["thread_status"],"updated_at"?: string
                  }
                  Update: {
                    "a_last_read_at"?: string | null,"b_last_read_at"?: string | null,"company_a_id"?: string,"company_b_id"?: string,"created_at"?: string,"current_version"?: number,"id"?: string,"last_activity_at"?: string,"status"?: Database["public"]['Enums']["thread_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "threads_company_a_id_fkey"
      columns: ["company_a_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "threads_company_b_id_fkey"
      columns: ["company_b_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_offer":
{ Args: { "p_expected_version": number,"p_thread": string }; Returns: string
                           },
"admin_blocked_requests":
{ Args: Record<PropertyKey, never>; Returns: {
              "reason": string,"starts_at": string,"thread_id": string
            }[]
                           },
"admin_reconcile_venues":
{ Args: { "p_apply"?: boolean }; Returns: Json
                           },
"admin_register_company":
{ Args: { "p_business_type": string,"p_contact_email": string,"p_contact_name": string,"p_contact_phone": string,"p_description"?: string,"p_login_email": string,"p_logo_url": string,"p_name": string,"p_partnership_interests"?: string,"p_products_services"?: string,"p_tier": Database["public"]['Enums']["company_tier"],"p_website"?: string }; Returns: string
                           },
"admin_set_shared_tables":
{ Args: { "p_apply"?: boolean,"p_count": number,"p_date": string }; Returns: Json
                           },
"apply_dedicated_tables":
{ Args: { "p_company": string }; Returns: undefined
                           },
"auth_user_id_by_email":
{ Args: { "p_email": string }; Returns: string
                           },
"complete_account_setup":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"counter_offer":
{ Args: { "p_ends_at": string,"p_expected_version": number,"p_message"?: string,"p_starts_at": string,"p_thread": string }; Returns: number
                           },
"current_company_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"decline_offer":
{ Args: { "p_expected_version": number,"p_thread": string }; Returns: undefined
                           },
"dedicated_bookings":
{ Args: { "p_company": string }; Returns: string
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_valid_slot":
{ Args: { "p_end": string,"p_start": string }; Returns: boolean
                           },
"lock_turn":
{ Args: { "p_expected_version": number,"p_me": string,"p_thread": string }; Returns: {
              "a_last_read_at": string | null,
"b_last_read_at": string | null,
"company_a_id": string,
"company_b_id": string,
"created_at": string,
"current_version": number,
"id": string,
"last_activity_at": string,
"status": Database["public"]['Enums']["thread_status"],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "threads"
        isOneToOne: true
        isSetofReturn: false
      } },
"mark_thread_read":
{ Args: { "p_thread": string }; Returns: undefined
                           },
"meeting_host":
{ Args: { "p_a": string,"p_b": string,"p_first_proposer": string }; Returns: string
                           },
"propose_meeting":
{ Args: { "p_ends_at": string,"p_message"?: string,"p_starts_at": string,"p_target": string }; Returns: string
                           },
"slot_availability":
{ Args: { "p_date": string,"p_target": string,"p_thread"?: string }; Returns: {
              "dedicated": boolean,"ends_at": string,"free_tables": number,"self_busy": boolean,"starts_at": string,"table_missing": boolean,"target_busy": boolean
            }[]
                           }
          }
          Enums: {
            "account_status": "pending"|"account_created"|"invite_sent"|"invite_failed"|"active","company_tier": "premium"|"access"|"matching_pool","meeting_status": "confirmed","table_kind": "shared"|"dedicated","thread_status": "pending"|"confirmed"|"declined"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "account_status": ["pending", "account_created", "invite_sent", "invite_failed", "active"],"company_tier": ["premium", "access", "matching_pool"],"meeting_status": ["confirmed"],"table_kind": ["shared", "dedicated"],"thread_status": ["pending", "confirmed", "declined"]
          }
        }
} as const

