#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-only
# benchmark-fixed-v3.sh - FibeMate Mixnet 性能基准测试（修复 curl 格式）
# 修复：curl -w 使用 %{time_total}，awk 做浮点计算
# 创建时间: 2026-05-26 04:08

set -e

# 配置
ENTRY_NODE="http://127.0.0.1:9001"
MIDDLE_NODE="http://127.0.0.1:9002"
EXIT_NODE="http://127.0.0.1:9003"
TEST_ROUNDS=10
MESSAGE_COUNT=100
CONCURRENT_CONNECTIONS=5

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 1. 延迟测试（精确浮点计算）
test_latency() {
    log_info "=== 延迟测试 (${TEST_ROUNDS} 轮) ==="
    
    log_info "测试入口节点延迟..."
    entry_total=0
    entry_results=()
    for i in $(seq 1 $TEST_ROUNDS); do
        # curl -w %{time_total} 输出秒（带小数，如 0.001070）
        time_sec=$(curl -s -o /dev/null -w "%{time_total}" "$ENTRY_NODE/health")
        # 转换为毫秒（awk 浮点计算）
        time_ms=$(awk "BEGIN {printf \"%.2f\", $time_sec * 1000}")
        entry_total=$(awk "BEGIN {print $entry_total + $time_ms}")
        entry_results+=("$time_ms")
        echo -n "."
    done
    echo ""
    entry_avg=$(awk "BEGIN {printf \"%.2f\", $entry_total / $TEST_ROUNDS}")
    log_info "入口节点平均延迟: ${entry_avg}ms (样本: ${entry_results[*]})"
    
    log_info "测试中间节点延迟..."
    middle_total=0
    middle_results=()
    for i in $(seq 1 $TEST_ROUNDS); do
        time_sec=$(curl -s -o /dev/null -w "%{time_total}" "$MIDDLE_NODE/health")
        time_ms=$(awk "BEGIN {printf \"%.2f\", $time_sec * 1000}")
        middle_total=$(awk "BEGIN {print $middle_total + $time_ms}")
        middle_results+=("$time_ms")
        echo -n "."
    done
    echo ""
    middle_avg=$(awk "BEGIN {printf \"%.2f\", $middle_total / $TEST_ROUNDS}")
    log_info "中间节点平均延迟: ${middle_avg}ms (样本: ${middle_results[*]})"
    
    log_info "测试出口节点延迟..."
    exit_total=0
    exit_results=()
    for i in $(seq 1 $TEST_ROUNDS); do
        time_sec=$(curl -s -o /dev/null -w "%{time_total}" "$EXIT_NODE/health")
        time_ms=$(awk "BEGIN {printf \"%.2f\", $time_sec * 1000}")
        exit_total=$(awk "BEGIN {print $exit_total + $time_ms}")
        exit_results+=("$time_ms")
        echo -n "."
    done
    echo ""
    exit_avg=$(awk "BEGIN {printf \"%.2f\", $exit_total / $TEST_ROUNDS}")
    log_info "出口节点平均延迟: ${exit_avg}ms (样本: ${exit_results[*]})"
    
    # 保存结果
    echo "延迟测试结果:" > /tmp/mixnet_benchmark_results.txt
    echo "入口节点: ${entry_avg}ms" >> /tmp/mixnet_benchmark_results.txt
    echo "中间节点: ${middle_avg}ms" >> /tmp/mixnet_benchmark_results.txt
    echo "出口节点: ${exit_avg}ms" >> /tmp/mixnet_benchmark_results.txt
    echo "" >> /tmp/mixnet_benchmark_results.txt
}

# 2. 吞吐量测试
test_throughput() {
    log_info "=== 吞吐量测试 (${MESSAGE_COUNT} 消息) ==="
    
    start=$(date +%s.%N 2>/dev/null || date +%s)
    
    # 发送多个并发请求
    for i in $(seq 1 $MESSAGE_COUNT); do
        curl -s -o /dev/null "$ENTRY_NODE/health" &
        if [ $((i % CONCURRENT_CONNECTIONS)) -eq 0 ]; then
            wait
        fi
    done
    wait
    
    end=$(date +%s.%N 2>/dev/null || date +%s)
    
    # 计算耗时（兼容不支持 %N 的系统）
    if [[ "$start" == *"."* ]] && [[ "$end" == *"."* ]]; then
        elapsed=$(awk "BEGIN {printf \"%.2f\", $end - $start}")
    else
        elapsed=$((end - start))
        [ $elapsed -eq 0 ] && elapsed=1
    fi
    
    # 计算吞吐量
    if [[ "$elapsed" == *"."* ]]; then
        throughput=$(awk "BEGIN {printf \"%.2f\", $MESSAGE_COUNT / $elapsed}")
    else
        throughput=$((MESSAGE_COUNT / elapsed))
    fi
    
    log_info "耗时: ${elapsed}s"
    log_info "吞吐量: ${throughput} 请求/秒"
    echo "吞吐量: ${throughput} 请求/秒 (耗时 ${elapsed}s)" >> /tmp/mixnet_benchmark_results.txt
    echo "" >> /tmp/mixnet_benchmark_results.txt
}

# 3. 资源使用监控
monitor_resources() {
    log_info "=== 资源使用监控 ==="
    
    log_info "入口节点进程资源使用:"
    ps aux | grep "node.*mixnet/entry" | grep -v grep | awk '{printf "CPU: %s%%, MEM: %s%%\n", $3, $4}' || log_warn "未找到入口节点进程"
    
    log_info "中间节点进程资源使用:"
    ps aux | grep "node.*mixnet/middle" | grep -v grep | awk '{printf "CPU: %s%%, MEM: %s%%\n", $3, $4}' || log_warn "未找到中间节点进程"
    
    log_info "出口节点进程资源使用:"
    ps aux | grep "node.*mixnet/exit" | grep -v grep | awk '{printf "CPU: %s%%, MEM: %s%%\n", $3, $4}' || log_warn "未找到出口节点进程"
    
    # 保存结果
    echo "资源使用:" >> /tmp/mixnet_benchmark_results.txt
    ps aux | grep "node.*mixnet" | grep -v grep | awk '{printf "%s: CPU %s%%, MEM %s%%\n", $11, $3, $4}' >> /tmp/mixnet_benchmark_results.txt
    echo "" >> /tmp/mixnet_benchmark_results.txt
}

# 4. PQ 握手延迟测试 (ML-KEM-768)
test_pq_handshake() {
    log_info "=== PQ 握手延迟测试 (ML-KEM-768) ==="
    
    # 检查 Node.js 后端是否可达
    if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/api/health 2>/dev/null | grep -q "200"; then
        log_info "测试 Node.js 后端 PQ 握手延迟..."
        total_time=0
        for i in $(seq 1 $TEST_ROUNDS); do
            time_sec=$(curl -s -o /dev/null -w "%{time_total}" http://127.0.0.1:3001/api/mlkem/test)
            time_ms=$(awk "BEGIN {printf \"%.2f\", $time_sec * 1000}")
            total_time=$(awk "BEGIN {print $total_time + $time_ms}")
            echo -n "."
        done
        echo ""
        avg_time=$(awk "BEGIN {printf \"%.2f\", $total_time / $TEST_ROUNDS}")
        log_info "Node.js PQ 握手平均延迟: ${avg_time}ms"
        echo "Node.js PQ 握手: ${avg_time}ms" >> /tmp/mixnet_benchmark_results.txt
    else
        log_warn "Node.js 后端 (3001) 不可达，跳过 PQ 握手测试"
    fi
    
    # 检查 Rust 后端是否可达
    if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3002/api/health 2>/dev/null | grep -q "200"; then
        log_info "测试 Rust 后端 PQ 握手延迟..."
        total_time=0
        for i in $(seq 1 $TEST_ROUNDS); do
            time_sec=$(curl -s -o /dev/null -w "%{time_total}" http://127.0.0.1:3002/api/mlkem/test)
            time_ms=$(awk "BEGIN {printf \"%.2f\", $time_sec * 1000}")
            total_time=$(awk "BEGIN {print $total_time + $time_ms}")
            echo -n "."
        done
        echo ""
        avg_time=$(awk "BEGIN {printf \"%.2f\", $total_time / $TEST_ROUNDS}")
        log_info "Rust 后端 PQ 握手平均延迟: ${avg_time}ms"
        echo "Rust 后端 PQ 握手: ${avg_time}ms" >> /tmp/mixnet_benchmark_results.txt
    else
        log_warn "Rust 后端 (3002) 不可达，跳过 PQ 握手测试"
    fi
    
    echo "" >> /tmp/mixnet_benchmark_results.txt
}

# 主函数
main() {
    log_info "开始 FibeMate Mixnet 性能基准测试"
    log_info "入口节点: $ENTRY_NODE"
    log_info "中间节点: $MIDDLE_NODE"
    log_info "出口节点: $EXIT_NODE"
    log_info "测试轮数: $TEST_ROUNDS"
    log_info "消息数量: $MESSAGE_COUNT"
    log_info "并发连接: $CONCURRENT_CONNECTIONS"
    echo ""
    
    # 检查节点是否可达
    log_info "检查节点可达性..."
    curl -s -o /dev/null "$ENTRY_NODE/health" || { log_error "入口节点不可达"; exit 1; }
    curl -s -o /dev/null "$MIDDLE_NODE/health" || { log_error "中间节点不可达"; exit 1; }
    curl -s -o /dev/null "$EXIT_NODE/health" || { log_error "出口节点不可达"; exit 1; }
    log_info "所有节点可达 ✓"
    echo ""
    
    # 运行测试
    test_latency
    test_throughput
    monitor_resources
    test_pq_handshake
    
    log_info "=== 测试完成 ==="
    log_info "结果已保存到 /tmp/mixnet_benchmark_results.txt"
    echo ""
    log_info "结果摘要:"
    cat /tmp/mixnet_benchmark_results.txt
}

# 运行主函数
main "$@"
