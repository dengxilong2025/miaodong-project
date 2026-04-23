package main

import (
	"log"
	"net/http"
	"os"
	"time"

	apphttp "github.com/dengxilong2025/miaodong-project/miaodong/services/api/internal/http"
)

func main() {
	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":8080"
	}

	s := &http.Server{
		Addr:              addr,
		Handler:           apphttp.NewRouter(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("miaodong-api listening on %s", addr)
	log.Fatal(s.ListenAndServe())
}

