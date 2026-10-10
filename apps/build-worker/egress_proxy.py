#!/usr/bin/env python3
"""Loopback CONNECT-only package egress proxy: exact hosts, public IPs, TLS port only."""
import argparse
import ipaddress
import json
import selectors
import socket
import socketserver
import threading
import time
import worker

SLOTS=threading.BoundedSemaphore(16)


def resolve(host,allowed):
    if host not in allowed:raise worker.Rejected('egress_denied')
    addresses=socket.getaddrinfo(host,443,type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):raise worker.Rejected('egress_denied')
    return addresses[0]


class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        if not SLOTS.acquire(blocking=False):return
        try:
            self.connection.settimeout(15)
            line=self.rfile.readline(2049)
            if len(line)>2048:return
            parts=line.decode('ascii').strip().split(' ')
            if len(parts)!=3 or parts[0]!='CONNECT' or not parts[1].endswith(':443'):return
            total=0
            while True:
                header=self.rfile.readline(2049);total+=len(header)
                if total>16000 or not header:return
                if header==b'\r\n':break
            family,kind,protocol,_,address=resolve(parts[1][:-4],self.server.allowed)
            with socket.socket(family,kind,protocol) as upstream:
                upstream.settimeout(15);upstream.connect(address)
                self.connection.sendall(b'HTTP/1.1 200 Connection Established\r\n\r\n')
                with selectors.DefaultSelector() as selector:
                    selector.register(self.connection,selectors.EVENT_READ,upstream);selector.register(upstream,selectors.EVENT_READ,self.connection)
                    deadline=time.monotonic()+300;size=0
                    while time.monotonic()<deadline and size<512*1024*1024:
                        for key,_ in selector.select(1):
                            data=key.fileobj.recv(65536)
                            if not data:return
                            size+=len(data);key.data.sendall(data)
        except Exception:pass
        finally:SLOTS.release()


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--config',required=True);args=parser.parse_args()
    config=json.loads(worker.private_file(args.config).read_text())
    with socketserver.ThreadingTCPServer(('127.0.0.1',3128),Handler) as server:
        server.daemon_threads=True;server.allowed=set(config['allowedHosts']);server.serve_forever()
