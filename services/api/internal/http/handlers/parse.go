package handlers

import (
	"net/http"
	"strconv"
)

func parseInt64(s string, def int64) int64 {
	if s == "" {
		return def
	}
	v, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return def
	}
	return v
}

// parseAttribution parses /admin/metrics attribution mode.
//
// Supported values:
// - by_request
//
// Default:
// - strict (includes empty/unknown values)
func parseAttribution(r *http.Request) string {
	v := r.URL.Query().Get("attribution")
	if v == "by_request" {
		return "by_request"
	}
	return "strict"
}
