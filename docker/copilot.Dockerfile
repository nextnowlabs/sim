FROM golang:1.26-alpine3.23 AS builder

ARG GOPROXY=https://goproxy.cn,direct
ENV GOPROXY=${GOPROXY}

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /copilot .

FROM alpine:3.23

ARG APK_MIRROR=mirrors.aliyun.com
RUN sed -i "s/dl-cdn.alpinelinux.org/${APK_MIRROR}/g" /etc/apk/repositories && \
    apk add --no-cache ca-certificates tzdata

COPY --from=builder /copilot /usr/local/bin/copilot

EXPOSE 3002

ENTRYPOINT ["copilot"]
