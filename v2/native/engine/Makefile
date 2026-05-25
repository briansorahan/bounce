CXX ?= c++
AR ?= ar

REPO_ROOT := $(shell git rev-parse --show-toplevel)
THIRD_PARTY := $(REPO_ROOT)/third_party

CXXFLAGS := -std=c++17 -fPIC -O2 \
    -I$(THIRD_PARTY)/miniaudio

SRCS := engine.cpp
OBJS := engine.o
LIB := libengine.a

.PHONY: all clean

all: $(LIB)

$(LIB): $(OBJS)
	$(AR) rcs $@ $^

engine.o: engine.cpp engine.h
	$(CXX) $(CXXFLAGS) -c $< -o $@

clean:
	rm -f $(OBJS) $(LIB)
