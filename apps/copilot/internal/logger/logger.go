package logger

import (
	"os"
	"strings"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var sugar *zap.SugaredLogger

func init() {
	level := zap.InfoLevel
	if lv := os.Getenv("LOG_LEVEL"); lv != "" {
		switch strings.ToLower(lv) {
		case "debug":
			level = zap.DebugLevel
		case "info":
			level = zap.InfoLevel
		case "warn":
			level = zap.WarnLevel
		case "error":
			level = zap.ErrorLevel
		}
	}

	encoderCfg := zap.NewDevelopmentEncoderConfig()
	encoderCfg.EncodeLevel = zapcore.CapitalColorLevelEncoder
	encoderCfg.EncodeTime = zapcore.ISO8601TimeEncoder

	core := zapcore.NewCore(
		zapcore.NewConsoleEncoder(encoderCfg),
		zapcore.AddSync(os.Stdout),
		level,
	)

	sugar = zap.New(core).Sugar()
}

func Debug(args ...interface{})                 { sugar.Debug(args...) }
func Debugf(template string, args ...interface{}) { sugar.Debugf(template, args...) }
func Info(args ...interface{})                  { sugar.Info(args...) }
func Infof(template string, args ...interface{})  { sugar.Infof(template, args...) }
func Warn(args ...interface{})                  { sugar.Warn(args...) }
func Warnf(template string, args ...interface{})  { sugar.Warnf(template, args...) }
func Error(args ...interface{})                 { sugar.Error(args...) }
func Errorf(template string, args ...interface{}) { sugar.Errorf(template, args...) }
func Fatal(args ...interface{})                 { sugar.Fatal(args...) }
func Fatalf(template string, args ...interface{}) { sugar.Fatalf(template, args...) }
