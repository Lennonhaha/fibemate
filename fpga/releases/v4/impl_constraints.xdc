# Implementation constraints for FIBEMATE FPGA v5.3
# All I/O = LVCMOS33 (3.3V)
# Part: xc7a35tfgg484-2

# Clock
set_property PACKAGE_PIN R4   [get_ports sys_clk]
set_property IOSTANDARD LVCMOS33 [get_ports sys_clk]
create_clock -period 20.000 -name sys_clk [get_ports sys_clk]

# LEDs
set_property PACKAGE_PIN N19  [get_ports {led[0]}]
set_property IOSTANDARD LVCMOS33 [get_ports {led[0]}]
set_property PACKAGE_PIN T19  [get_ports {led[1]}]
set_property IOSTANDARD LVCMOS33 [get_ports {led[1]}]
set_property PACKAGE_PIN U20  [get_ports {led[2]}]
set_property IOSTANDARD LVCMOS33 [get_ports {led[2]}]
set_property PACKAGE_PIN V20  [get_ports {led[3]}]
set_property IOSTANDARD LVCMOS33 [get_ports {led[3]}]

# UART (uart_tx -> M18 = PMOD1 pin2)
set_property PACKAGE_PIN M18  [get_ports uart_tx]
set_property IOSTANDARD LVCMOS33 [get_ports uart_tx]
set_property PACKAGE_PIN N20  [get_ports uart_rx]
set_property IOSTANDARD LVCMOS33 [get_ports uart_rx]

# NTT debug A - ALL LVCMOS33 (no 1.8V mixed)
set_property PACKAGE_PIN N17  [get_ports {ntt_debug_a[0]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_a[0]}]
set_property PACKAGE_PIN P17  [get_ports {ntt_debug_a[1]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_a[1]}]
set_property PACKAGE_PIN P19  [get_ports {ntt_debug_a[2]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_a[2]}]
set_property PACKAGE_PIN R19  [get_ports {ntt_debug_a[3]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_a[3]}]
set_property PACKAGE_PIN R18  [get_ports {ntt_debug_a[4]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_a[4]}]
set_property PACKAGE_PIN T18  [get_ports {ntt_debug_a[5]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_a[5]}]
set_property PACKAGE_PIN W21  [get_ports {ntt_debug_a[6]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_a[6]}]
set_property PACKAGE_PIN W22  [get_ports {ntt_debug_a[7]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_a[7]}]
set_property PACKAGE_PIN F13  [get_ports {ntt_debug_a[8]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_a[8]}]
set_property PACKAGE_PIN F14  [get_ports {ntt_debug_a[9]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_a[9]}]
set_property PACKAGE_PIN E13  [get_ports {ntt_debug_a[10]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_a[10]}]
set_property PACKAGE_PIN E14  [get_ports {ntt_debug_a[11]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_a[11]}]
set_property PACKAGE_PIN D14  [get_ports {ntt_debug_a[12]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_a[12]}]

# NTT debug B (lower 6 bits - no pin, just IOSTANDARD to avoid UCIO-1)
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_b[0]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_b[1]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_b[2]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_b[3]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_b[4]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_b[5]}]
set_property PACKAGE_PIN T20  [get_ports {ntt_debug_b[0]}]
set_property PACKAGE_PIN V18  [get_ports {ntt_debug_b[1]}]
set_property PACKAGE_PIN V19  [get_ports {ntt_debug_b[2]}]
set_property PACKAGE_PIN Y19  [get_ports {ntt_debug_b[3]}]
set_property PACKAGE_PIN AA18 [get_ports {ntt_debug_b[4]}]
set_property PACKAGE_PIN AA19 [get_ports {ntt_debug_b[5]}]
set_property PACKAGE_PIN V22  [get_ports {ntt_debug_b[6]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_b[6]}]
set_property PACKAGE_PIN W20  [get_ports {ntt_debug_b[7]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_b[7]}]
set_property PACKAGE_PIN H14  [get_ports {ntt_debug_b[8]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_b[8]}]
set_property PACKAGE_PIN G13  [get_ports {ntt_debug_b[9]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_b[9]}]
set_property PACKAGE_PIN C15  [get_ports {ntt_debug_b[10]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_b[10]}]
set_property PACKAGE_PIN D15  [get_ports {ntt_debug_b[11]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_b[11]}]
set_property PACKAGE_PIN B15  [get_ports {ntt_debug_b[12]}]
set_property IOSTANDARD LVCMOS33 [get_ports {ntt_debug_b[12]}]

# ntt_done
set_property PACKAGE_PIN D17  [get_ports ntt_done]
set_property IOSTANDARD LVCMOS33 [get_ports ntt_done]

# ntt_done_fwd (W19) and ntt_done_inv (Y18)
set_property PACKAGE_PIN W19  [get_ports ntt_done_fwd]
set_property IOSTANDARD LVCMOS33 [get_ports ntt_done_fwd]
set_property PACKAGE_PIN Y18  [get_ports ntt_done_inv]
set_property IOSTANDARD LVCMOS33 [get_ports ntt_done_inv]
set_property IOSTANDARD LVCMOS33 [get_ports ntt_done]

# Configuration
set_property CONFIG_VOLTAGE 3.3 [current_design]
set_property CFGBVS VCCO [current_design]
set_property BITSTREAM.GENERAL.COMPRESS TRUE [current_design]
set_property BITSTREAM.CONFIG.CONFIGRATE 33 [current_design]
