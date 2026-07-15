CC      = gcc
CFLAGS  = -O3 -fPIC -Wall -Wextra -std=c99
LDFLAGS = -shared

LIB     = liblgv2.so
OBJS    = lgv2_confuse.o
TESTBIN = test_lgv2

.PHONY: all clean test

all: $(LIB)

$(LIB): $(OBJS)
	$(CC) $(LDFLAGS) -o $@ $^

lgv2_confuse.o: lgv2_confuse.c lgv2_confuse.h
	$(CC) $(CFLAGS) -c -o $@ lgv2_confuse.c

test: $(TESTBIN)
	./$(TESTBIN)

$(TESTBIN): lgv2_confuse.c lgv2_confuse.h
	$(CC) -O2 -Wall -DTEST_LGV2 -o $@ lgv2_confuse.c

clean:
	rm -f $(OBJS) $(LIB) $(TESTBIN)
