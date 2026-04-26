package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// AdminToolsGuides handles:
// - GET /admin/tools-guides?problem_id=...
//
// problem_id 必填；不存在则 404。
func AdminToolsGuides(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	switch r.Method {
	case http.MethodGet:
		adminGetToolsGuideByProblemIDQuery(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// AdminToolsGuideByProblemID handles:
// - PUT /admin/tools-guides/{problem_id}
//
// upsert：不存在则 insert（id=tg_<problem_id>），存在则 update。
func AdminToolsGuideByProblemID(w http.ResponseWriter, r *http.Request) {
	if !requireAdmin(w, r) {
		return
	}
	problemID := strings.TrimPrefix(r.URL.Path, "/admin/tools-guides/")
	if problemID == "" {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodPut:
		adminUpsertToolsGuide(w, r, problemID)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

type adminToolsGuide struct {
	ID                 string `json:"id"`
	ProblemID           string `json:"problem_id"`
	CollapsedByDefault  bool   `json:"collapsed_by_default"`
	GuideBullets        any    `json:"guide_bullets"`
	EfficiencyItems     any    `json:"efficiency_items"`
	Status              string `json:"status"`
	UpdatedAt           string `json:"updated_at"`
}

func adminGetToolsGuideByProblemIDQuery(w http.ResponseWriter, r *http.Request) {
	problemID := r.URL.Query().Get("problem_id")
	if problemID == "" {
		http.Error(w, "missing fields: problem_id", http.StatusBadRequest)
		return
	}

	conn, err := openAdminContentDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	var out adminToolsGuide
	var guideBulletsJSON []byte
	var efficiencyItemsJSON []byte
	var updated time.Time
	err = conn.QueryRow(`
select id, problem_id, collapsed_by_default, guide_bullets, efficiency_items, status, updated_at
from tools_guides
where problem_id=$1
`, problemID).Scan(
		&out.ID, &out.ProblemID, &out.CollapsedByDefault, &guideBulletsJSON, &efficiencyItemsJSON, &out.Status, &updated,
	)
	if err == sql.ErrNoRows {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = json.Unmarshal(guideBulletsJSON, &out.GuideBullets)
	_ = json.Unmarshal(efficiencyItemsJSON, &out.EfficiencyItems)
	out.UpdatedAt = updated.UTC().Format(time.RFC3339)

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(out)
}

func adminUpsertToolsGuide(w http.ResponseWriter, r *http.Request, problemID string) {
	var in struct {
		Actor              string           `json:"actor"`
		CollapsedByDefault *bool            `json:"collapsed_by_default"`
		GuideBullets       *json.RawMessage `json:"guide_bullets"`
		EfficiencyItems    *json.RawMessage `json:"efficiency_items"`
		Status             *string          `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if in.Actor == "" {
		in.Actor = "admin"
	}
	if in.Status != nil && !adminToolsGuideStatusOK(*in.Status) {
		http.Error(w, "invalid fields: status", http.StatusBadRequest)
		return
	}

	// 预解析 jsonb 字段，用于 diff 以及类型校验（至少保证是合法 JSON）
	var guideBulletsAny any
	if in.GuideBullets != nil {
		if len(*in.GuideBullets) == 0 || string(*in.GuideBullets) == "null" {
			http.Error(w, "invalid fields: guide_bullets", http.StatusBadRequest)
			return
		}
		if err := json.Unmarshal(*in.GuideBullets, &guideBulletsAny); err != nil {
			http.Error(w, "invalid fields: guide_bullets", http.StatusBadRequest)
			return
		}
	}
	var efficiencyItemsAny any
	if in.EfficiencyItems != nil {
		if len(*in.EfficiencyItems) == 0 || string(*in.EfficiencyItems) == "null" {
			http.Error(w, "invalid fields: efficiency_items", http.StatusBadRequest)
			return
		}
		if err := json.Unmarshal(*in.EfficiencyItems, &efficiencyItemsAny); err != nil {
			http.Error(w, "invalid fields: efficiency_items", http.StatusBadRequest)
			return
		}
	}

	conn, err := openAdminContentDB()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer conn.Close()

	tx, err := conn.Begin()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer func() { _ = tx.Rollback() }()

	var exists bool
	if err := tx.QueryRow(`select exists(select 1 from tools_guides where problem_id=$1)`, problemID).Scan(&exists); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if !exists {
		// insert（默认值对齐 migration）
		id := "tg_" + problemID

		collapsed := true
		if in.CollapsedByDefault != nil {
			collapsed = *in.CollapsedByDefault
		}

		guideBulletsStr := "[]"
		if in.GuideBullets != nil {
			guideBulletsStr = string(*in.GuideBullets)
		} else {
			guideBulletsAny = []any{}
		}

		efficiencyItemsStr := "[]"
		if in.EfficiencyItems != nil {
			efficiencyItemsStr = string(*in.EfficiencyItems)
		} else {
			efficiencyItemsAny = []any{}
		}

		status := "draft"
		if in.Status != nil {
			status = *in.Status
		}

		_, err := tx.Exec(`
insert into tools_guides (id, problem_id, collapsed_by_default, guide_bullets, efficiency_items, status)
values ($1,$2,$3,$4::jsonb,$5::jsonb,$6)
`, id, problemID, collapsed, guideBulletsStr, efficiencyItemsStr, status)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		_ = insertAudit(tx, in.Actor, "create", "tools_guide", problemID, map[string]any{
			"collapsed_by_default": collapsed,
			"guide_bullets":        guideBulletsAny,
			"efficiency_items":     efficiencyItemsAny,
			"status":              status,
		})

		if err := tx.Commit(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]any{"id": id})
		return
	}

	// update（动态 SQL）
	sets := make([]string, 0, 6)
	args := make([]any, 0, 7)
	n := 1
	diff := map[string]any{}

	if in.CollapsedByDefault != nil {
		sets = append(sets, "collapsed_by_default=$"+itoa(n))
		args = append(args, *in.CollapsedByDefault)
		diff["collapsed_by_default"] = *in.CollapsedByDefault
		n++
	}
	if in.GuideBullets != nil {
		sets = append(sets, "guide_bullets=$"+itoa(n)+"::jsonb")
		args = append(args, string(*in.GuideBullets))
		diff["guide_bullets"] = guideBulletsAny
		n++
	}
	if in.EfficiencyItems != nil {
		sets = append(sets, "efficiency_items=$"+itoa(n)+"::jsonb")
		args = append(args, string(*in.EfficiencyItems))
		diff["efficiency_items"] = efficiencyItemsAny
		n++
	}
	if in.Status != nil {
		sets = append(sets, "status=$"+itoa(n))
		args = append(args, *in.Status)
		diff["status"] = *in.Status
		n++
	}
	sets = append(sets, "updated_at=now()")

	if len(diff) == 0 {
		http.Error(w, "no changes", http.StatusBadRequest)
		return
	}

	args = append(args, problemID)
	q := "update tools_guides set " + strings.Join(sets, ",") + " where problem_id=$" + itoa(n)
	res, err := tx.Exec(q, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	aff, _ := res.RowsAffected()
	if aff == 0 {
		http.NotFound(w, r)
		return
	}

	_ = insertAudit(tx, in.Actor, "update", "tools_guide", problemID, diff)

	if err := tx.Commit(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func adminToolsGuideStatusOK(s string) bool {
	switch s {
	case "draft", "published", "archived":
		return true
	default:
		return false
	}
}
