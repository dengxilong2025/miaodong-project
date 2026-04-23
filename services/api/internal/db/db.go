package db

import (
	"database/sql"
	"os"
	"time"

	_ "github.com/lib/pq"
)

func Open() (*sql.DB, error) {
	dsn := os.Getenv("MIAODONG_DSN")
	if dsn == "" {
		dsn = "postgres://postgres:postgres@localhost:5432/miaodong?sslmode=disable"
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}

	// 基础连接池参数（MVP）
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(30 * time.Minute)

	return db, nil
}

